import { createKafkaClient, TypedProducer } from '@contento/shared'

let _producer: TypedProducer | null = null

export function getKafkaProducer(): TypedProducer {
  if (!_producer) {
    const kafka = createKafkaClient({ clientId: 'api' })
    _producer = new TypedProducer(kafka)
  }
  return _producer
}
