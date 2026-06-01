import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '@contento/db'

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
})

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required but not set')

  app.post('/auth/register', {
    schema: { body: RegisterBody },
  }, async (request, reply) => {
    const { email, password, name } = request.body as z.infer<typeof RegisterBody>

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({ data: { email, name: name ?? null, passwordHash } })

    const token = jwt.sign({ sub: user.id }, secret, { expiresIn: '30d' })

    return { token, user: { id: user.id, email: user.email, name: user.name } }
  })

  app.post('/auth/login', {
    schema: { body: LoginBody },
  }, async (request, reply) => {
    const { email, password } = request.body as z.infer<typeof LoginBody>

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user?.passwordHash) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const token = jwt.sign({ sub: user.id }, secret, { expiresIn: '30d' })

    return { token, user: { id: user.id, email: user.email, name: user.name } }
  })
}
