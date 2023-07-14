import { Hono } from 'hono'
import type { Bindings } from '../types'

export const mitWorkerApp = new Hono<{ Bindings: Bindings }>()
  .get('/worker_ws', async ({ env, req }) => {
    if (req.header('Upgrade') !== 'websocket')
      return new Response('Not a websocket request', { status: 400 })

    const encoder = new TextEncoder()
    if (!req.header('x-secret'))
      return new Response('Forbidden', { status: 403 })
    // @ts-expect-error Cloudflare only
    if (!crypto.subtle.timingSafeEqual(
      encoder.encode(req.header('x-secret')!),
      encoder.encode(env.MIT_WORKERS_SECRET),
    ))
      return new Response('Forbidden', { status: 403 })

    // pass the request to durable object
    const id = env.doMitWorker.idFromName('default')
    return env.doMitWorker.get(id, { locationHint: 'enam' })
      .fetch('https://fake-host/worker_ws', req.raw)
      .then(res => new Response(res.body, res))
  })
