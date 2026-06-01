import nodemailer from 'nodemailer'

function createTransport() {
  const resendApiKey = process.env['RESEND_API_KEY']

  if (resendApiKey) {
    // Use Resend SMTP bridge (preferred)
    return nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: resendApiKey,
      },
    })
  }

  const host = process.env['SMTP_HOST']
  const port = parseInt(process.env['SMTP_PORT'] ?? '587', 10)
  const user = process.env['SMTP_USER']
  const pass = process.env['SMTP_PASS']

  if (!host) {
    throw new Error('Email not configured: set RESEND_API_KEY or SMTP_HOST')
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  })
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const from = process.env['SMTP_FROM'] ?? 'Contento <noreply@contento.app>'
  const transport = createTransport()
  await transport.sendMail({ from, to, subject, html })
}
