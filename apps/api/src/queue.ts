import { Queue } from 'bullmq'
import { Redis as IORedis } from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

let _connection: IORedis | null = null
let _queue: Queue | null = null

export function getRenderQueue(): Queue {
  if (!_queue) {
    _connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
    _queue = new Queue('render', { connection: _connection })
  }
  return _queue
}

let _trendFetchConnection: IORedis | null = null
let _trendFetchQueue: Queue | null = null

export function getTrendFetchQueue(): Queue {
  if (!_trendFetchQueue) {
    _trendFetchConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
    _trendFetchQueue = new Queue('trend-fetch', { connection: _trendFetchConnection })
  }
  return _trendFetchQueue
}

let _hooksEvolveConnection: IORedis | null = null
let _hooksEvolveQueue: Queue | null = null

export function getHooksEvolveQueue(): Queue {
  if (!_hooksEvolveQueue) {
    _hooksEvolveConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
    _hooksEvolveQueue = new Queue('hooks-evolve', { connection: _hooksEvolveConnection })
  }
  return _hooksEvolveQueue
}

let _videoConnection: IORedis | null = null
let _videoQueue: Queue | null = null

export function getVideoQueue(): Queue {
  if (!_videoQueue) {
    _videoConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
    _videoQueue = new Queue('video', { connection: _videoConnection })
  }
  return _videoQueue
}

let _campaignProducerConnection: IORedis | null = null
let _campaignProducerQueue: Queue | null = null

export function getCampaignProducerQueue(): Queue {
  if (!_campaignProducerQueue) {
    _campaignProducerConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
    _campaignProducerQueue = new Queue('campaign-producer', { connection: _campaignProducerConnection })
  }
  return _campaignProducerQueue
}

let _instagramConnection: IORedis | null = null
let _instagramQueue: Queue | null = null

/** Inbound Instagram DM events (feature B2 — sales-funnel agent). Consumed by apps/instagram-agent. */
export function getInstagramQueue(): Queue {
  if (!_instagramQueue) {
    _instagramConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
    _instagramQueue = new Queue('instagram-dm', { connection: _instagramConnection })
  }
  return _instagramQueue
}
