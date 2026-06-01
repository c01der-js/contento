import type { Kafka, Producer } from 'kafkajs'

export class TypedProducer {
  private producer: Producer
  private connectPromise: Promise<void> | null = null

  constructor(kafka: Kafka) {
    this.producer = kafka.producer()
  }

  private ensureConnected(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = this.producer.connect().catch((err) => {
        this.connectPromise = null
        throw err
      })
    }
    return this.connectPromise
  }

  async send<T>(topic: string, payload: T, key?: string): Promise<void> {
    await this.ensureConnected()
    await this.producer.send({
      topic,
      messages: [{ key: key ?? null, value: JSON.stringify(payload) }],
    })
  }

  async disconnect(): Promise<void> {
    if (this.connectPromise) {
      await this.connectPromise.catch(() => {}) // wait for any pending connect
      await this.producer.disconnect()
      this.connectPromise = null
    }
  }
}
