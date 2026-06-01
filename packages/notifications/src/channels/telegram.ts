export async function sendTelegram(chatId: string, message: string): Promise<void> {
  const token = process.env['TELEGRAM_BOT_TOKEN']
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set')
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram API error ${response.status}: ${body}`)
  }
}
