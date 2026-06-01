import { type ZodSchema } from 'zod'
import type { Kafka, Consumer } from 'kafkajs'

export type MessageHandler<T> = (topic: string, payload: T) => Promise<void>
export type ErrorHandler = (topic: string, error: unknown, rawValue: string) => Promise<void>

export class TypedConsumer {
  private consumer: Consumer
  private connectPromise: Promise<void> | null = null

  constructor(kafka: Kafka, private readonly groupId: string) {
    this.consumer = kafka.consumer({ groupId })
  }

  private ensureConnected(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = this.consumer.connect()
    }
    return this.connectPromise
  }

  async subscribe(topics: string[], fromBeginning = false): Promise<void> {
    await this.ensureConnected()
    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning })
    }
  }

  async run<T>(
    handler: MessageHandler<T>,
    options?: {
      schema?: ZodSchema<T>
      onError?: ErrorHandler
    },
  ): Promise<void> {
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return
        const rawValue = message.value.toString()
        try {
          const parsed = JSON.parse(rawValue)
          const payload = options?.schema ? options.schema.parse(parsed) : (parsed as T)
          await handler(topic, payload)
        } catch (error) {
          if (options?.onError) {
            await options.onError(topic, error, rawValue)
          } else {
            console.error(`[TypedConsumer] Error processing message on topic ${topic}:`, error)
          }
        }
      },
    })
  }

  async disconnect(): Promise<void> {
    if (this.connectPromise) {
      await this.connectPromise.catch(() => {})
      await this.consumer.disconnect()
      this.connectPromise = null
    }
  }
}
