import { Hono } from 'hono'
import { ofetch } from 'ofetch'
import type { Bindings, QueryV1Message, QueryV1MessageNotFound } from '../types'
import { dbEnum } from '../db'
import { upload } from './upload'

export const taskApp = new Hono<{ Bindings: Bindings }>()
  .post('/upload/v1', upload)
  .put('/upload/v1', upload)
  .get('/group/:group/event/v1', async ({ env, req }) => {
    const group = req.param('group')

    if (req.header('Upgrade') !== 'websocket')
      throw new Error('Not a websocket request')

    const mitWorkerId = env.doMitWorker.idFromName('default')
    return await env.doMitWorker
      .get(mitWorkerId, { locationHint: 'enam' })
      .fetch(`https://fake-host/group/event/${group}`, req.raw)
      .then(res => new Response(res.body, res))
  })
  .get('/:id/status/v1', async ({ env, req, json }) => {
    const id = req.param('id')

    const mitWorkerId = env.doMitWorker.idFromName('default')
    const mitWorkerResult = await ofetch<QueryV1Message>(`https://fake-host/status/${id}`, {
      fetcher: env.doMitWorker.get(mitWorkerId, { locationHint: 'enam' }),
    })

    if (mitWorkerResult.type !== 'not_found')
      return json(mitWorkerResult)

    const dbResult = await env.DB
      .prepare('SELECT state, translation_mask FROM task WHERE id = ?')
      .bind(id)
      .first<{ state: number; translation_mask: string } | null>()

    if (!dbResult)
      return json({ type: 'not_found' } satisfies QueryV1Message)

    if (dbResult.state === dbEnum.taskState.done) {
      return json({
        type: 'result',
        result: {
          translation_mask: `${env.WKR2_PUBLIC_EXPOSED_BASE}/${dbResult.translation_mask}`,
        },
      } satisfies QueryV1Message)
    }
    else if (dbResult.state === dbEnum.taskState.error) {
      return json({ type: 'error' } satisfies QueryV1Message)
    }
    else {
      return json({
        type: 'status',
        status: 'pending',
      } satisfies QueryV1Message)
    }
  })
  .get('/:id/event/v1', async ({ env, req }) => {
    const id = req.param('id')

    if (req.header('Upgrade') !== 'websocket')
      throw new Error('Not a websocket request')

    const mitWorkerId = env.doMitWorker.idFromName('default')
    const mitWorkerResult = await env.doMitWorker
      .get(mitWorkerId, { locationHint: 'enam' })
      .fetch(`https://fake-host/event/${id}`, req.raw)

    if (mitWorkerResult.status === 101)
      return new Response(mitWorkerResult.body, mitWorkerResult)

    const status = await mitWorkerResult.json<QueryV1MessageNotFound>()
    if (status.type === 'not_found') {
      const dbResult = await env.DB
        .prepare('SELECT state, translation_mask FROM task WHERE id = ?')
        .bind(id)
        .first<{ state: number; translation_mask: string } | null>()

      const sendAndClose = (data: QueryV1Message) => {
        const pair = new WebSocketPair()
        // @ts-expect-error Cloudflare only
        pair[1].accept()
        pair[1].send(JSON.stringify(data))
        pair[1].close()
        return new Response(null, { status: 101, webSocket: pair[0] })
      }

      if (!dbResult)
        return sendAndClose({ type: 'not_found' })

      if (dbResult.state === dbEnum.taskState.done) {
        return sendAndClose({
          type: 'result',
          result: {
            translation_mask: `${env.WKR2_PUBLIC_EXPOSED_BASE}/${dbResult.translation_mask}`,
          },
        })
      }
      else if (dbResult.state === dbEnum.taskState.error) {
        return sendAndClose({ type: 'error' })
      }
      else {
        return sendAndClose({
          type: 'status',
          status: 'pending',
        })
      }
    }
    else {
      throw new Error('Unexpected response')
    }
  })
