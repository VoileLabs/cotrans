import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { ofetch } from 'ofetch'
import type { Bindings } from './types'
import { taskApp } from './task'
import { mitWorkerApp } from './mitWorker'

const CORS_ORIGINS: (string | RegExp)[] = [
  /https?:\/\/localhost(?::\d+)?/,
  'https://cotrans.touhou.ai',
]

const app = new Hono<{ Bindings: Bindings }>()
  .use('*', cors({
    origin: origin =>
      CORS_ORIGINS.some(
        o => typeof o === 'string'
          ? o === origin
          : o.test(origin),
      )
        ? origin
        : null,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 10 * 60,
  }))
  .get('/', ({ text }) => text(`Cotrans API by VoileLabs ${import.meta.env.VERSION}`))
  .get('/status/v1', async ({ env, json }) => {
    const mitWorkerId = env.doMitWorker.idFromName('default')
    const mitWorker = await ofetch('https://fake-host/status', {
      fetcher: env.doMitWorker.get(mitWorkerId, { locationHint: 'enam' }),
    })
    return json({
      version: import.meta.env.VERSION,
      build_time: import.meta.env.BUILD_TIME,
      mit_worker: mitWorker,
    })
  })
  .route('/task', taskApp)
  .route('/mit', mitWorkerApp)
  .onError((err) => {
    if (err instanceof HTTPException) {
      // get the custom response
      return err.getResponse()
    }

    console.error(String(err instanceof Error ? (err.stack ?? err) : err))

    // return a generic response
    return new Response('Internal Server Error', { status: 500 })
  })

export default app
