import { Kafka, type KafkaConfig } from 'kafkajs'

export function createKafkaClient(config?: Partial<KafkaConfig>): Kafka {
  return new Kafka({
    clientId: config?.clientId ?? 'contento',
    brokers: config?.brokers ?? (process.env['KAFKA_BROKERS']?.split(',') ?? ['localhost:9094']),
    ...config,
  })
}
