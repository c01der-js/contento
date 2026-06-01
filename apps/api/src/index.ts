import { createServer } from './server.js'

const PORT = Number(process.env.PORT ?? 3001)

const app = await createServer()

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
