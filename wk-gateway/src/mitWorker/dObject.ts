import { z } from 'zod'
import { SignJWT, importPKCS8, importSPKI } from 'jose'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Bindings, QueryV1Message } from '../types'
import { WebSocketMessage } from '../protoGen/gateway.mit_pb'
import { dbEnum } from '../db'

const QUEUE_CAP = 40
// const QUEUE_GC_TARGET = 20
// const QUEUE_PICKUP = 4
// const QUEYE_PICKUP_COUNT = 4

function memo<T>(fn: () => NonNullable<T>): () => NonNullable<T> {
  let cache: T
  return () => cache ??= fn()
}

function sendAndClose(data: unknown) {
  const pair = new WebSocketPair()
  // @ts-expect-error Cloudflare only
  pair[1].accept()
  pair[1].send(JSON.stringify(data))
  pair[1].close()
  return new Response(null, { status: 101, webSocket: pair[0] })
}

export interface MitTask {
  id: string
  file: string
  target_language: string
  detector: string
  direction: string
  translator: string
  size: string
}

interface WsWorkerAttachment {
  // type: worker
  t: 'wk'
  // tasks currently being processed
  q: [
    // task_id
    string,
    // task_status
    string,
    // translation_mask
    string,
  ][]
}

interface WsListenerAttachment {
  // type: listener
  t: 'ls'
  // task_id
  tid: string
}

type WsAttachment = WsWorkerAttachment | WsListenerAttachment

interface WsMsgContext<T> {
  ws: WebSocket
  msg: string | ArrayBuffer
  attachment: T
}

interface WsCloseContext<T> {
  ws: WebSocket
  attachment: T
  code: number
  reason: string
  wasClean: boolean
}

const SubmitParam = z.object({
  id: z.string(),
  file: z.string(),
  target_language: z.string(),
  detector: z.string(),
  direction: z.string(),
  translator: z.string(),
  size: z.string(),
})
export type MitSubmitParam = z.infer<typeof SubmitParam>

export class DOMitWorker implements DurableObject {
  state: DurableObjectState
  env: Bindings

  jwt_private_key: () => Promise<CryptoKey>
  jwt_public_key: () => Promise<CryptoKey>
  app: () => Hono<{ Bindings: Bindings }>

  queue: MitTask[] | undefined
  queueDirty = false

  constructor(state: DurableObjectState, env: Bindings) {
    this.state = state
    this.env = env

    // this.state.blockConcurrencyWhile(() => this.getQueue())

    this.jwt_private_key = memo(() => importPKCS8(env.JWT_PRIVATE_KEY, 'ES256'))
    this.jwt_public_key = memo(() => importSPKI(env.JWT_PUBLIC_KEY, 'ES256'))

    this.app = memo(() => new Hono<{ Bindings: Bindings }>()
      .get('/status', async ({ json }) => {
        const queue = await this.getQueue()
        const workers = this.state.getWebSockets('wk')
        return json({
          queue: queue.length,
          workers: workers.length,
        })
      })
      .get('/worker_ws', async ({ req }) => {
        if (req.header('Upgrade') !== 'websocket')
          throw new Error('Not a websocket request')

        // authentication is done by the worker, so no need to check here

        const pair = new WebSocketPair()

        this.state.acceptWebSocket(pair[1], ['wk'])

        const attachment: WsWorkerAttachment = { t: 'wk', q: [] }
        // @ts-expect-error missing in types
        pair[1].serializeAttachment(attachment)

        // find task for this worker
        await this.assignTasks([pair[1]])

        return new Response(null, { status: 101, webSocket: pair[0] })
      })
      .put('/submit', async ({ req, json }) => {
        const param = SubmitParam.parse(await req.json())

        const task: MitTask = {
          id: param.id,
          file: param.file,
          target_language: param.target_language,
          detector: param.detector,
          direction: param.direction,
          translator: param.translator,
          size: param.size,
        }

        const queue = await this.getQueue()

        // special case: if the task id is already in the queue,
        // we replace it with the new task.
        // duplication can happen if there's a force retry request submitted
        // while the old task is still in the queue.
        const pos = queue.findIndex(task => task.id === param.id)
        if (pos !== -1)
          queue[pos] = task
        // if the queue is full, we reject the request
        else if (queue.length >= QUEUE_CAP)
          throw new Error('Queue is full')
        else
          queue.push(task)

        await this.putQueue(queue, false)

        // notify workers
        await this.assignTasks()

        await this.flushQueue()

        return json({ id: task.id, pos: pos === -1 ? queue.length : pos })
      })
      .get('/status/:id', async ({ req, json }) => {
        const id = req.param('id')

        const status = await this.findTaskStatus(id)

        return json(status)
      })
      .get('/event/:id', async ({ req, json }) => {
        const id = req.param('id')

        if (req.header('Upgrade') !== 'websocket')
          throw new Error('Not a websocket request')

        const status = await this.findTaskStatus(id)

        if (status.type === 'not_found')
          // special case: if the task is not found,
          // we return a json response to let the upstream worker know.
          return json({ type: 'not_found' })

        const pair = new WebSocketPair()

        this.state.acceptWebSocket(pair[1], ['ls', `ls:${id}`])

        const attachment: WsListenerAttachment = { t: 'ls', tid: id }
        // @ts-expect-error missing in types
        pair[1].serializeAttachment(attachment)

        // send the current status
        pair[1].send(JSON.stringify(status))

        return new Response(null, { status: 101, webSocket: pair[0] })
      })
      .onError((err) => {
        if (err instanceof HTTPException) {
          // get the custom response
          return err.getResponse()
        }

        console.error(String(err instanceof Error ? (err.stack ?? err) : err))

        // return a generic response
        return new Response('Internal Server Error', { status: 500 })
      }),
    )
  }

  async getQueue(): Promise<MitTask[]> {
    if (this.queue === undefined)
      this.queue = await this.state.storage.get<MitTask[]>('queue') ?? []
    return this.queue
  }

  async putQueue(queue: MitTask[], flush = true) {
    this.queue = queue
    this.queueDirty = true
    if (flush)
      this.flushQueue()
  }

  async flushQueue() {
    if (this.queueDirty) {
      await this.state.storage.put('queue', this.queue)
      this.queueDirty = false
    }
  }

  async findTaskStatus(id: string): Promise<QueryV1Message> {
    // since there's probably always less workers than tasks,
    // we can first iterate through all workers
    const workers = this.state.getWebSockets('wk')
    for (const worker of workers) {
      // @ts-expect-error missing in types
      const attachment: WsWorkerAttachment = worker.deserializeAttachment()
      for (const [tid, ts] of attachment.q) {
        if (tid === id)
          return { type: 'status', status: ts }
      }
    }

    // then check the queue
    const queue = await this.getQueue()
    const pos = queue.findIndex(task => task.id === id)
    if (pos !== -1)
      return { type: 'pending', pos: pos + 1 }

    return { type: 'not_found' }
  }

  async assignTasks(workers = this.state.getWebSockets('wk')) {
    if (workers.length === 0)
      return

    let workerWithAttachments = workers.map((ws) => {
      // @ts-expect-error missing in types
      const attachment: WsWorkerAttachment = ws.deserializeAttachment()
      return { ws, attachment }
    })
    const queue = await this.getQueue()

    const processingIds = workerWithAttachments
      .flatMap(({ attachment }) => attachment.q[0])
    const skipped: MitTask[] = []
    const dirtyWS = new Map<WebSocket, WsWorkerAttachment>()

    while (queue.length > 0) {
      workerWithAttachments = workerWithAttachments
        // max 2 tasks per worker
        .filter(({ attachment }) => {
          return attachment.q.length < 2
        })
        // shortest queue first
        .sort((a, b) => a.attachment.q.length - b.attachment.q.length)

      if (workerWithAttachments.length === 0)
        break

      const { ws, attachment } = workerWithAttachments[0]

      const task = queue.shift()!

      // special case: if the task id is being processed by a worker,
      // we skip it and try again later
      if (processingIds.includes(task.id)) {
        skipped.push(task)
        continue
      }

      const translationMask = `mask/${task.id}.png`
      attachment.q.push([task.id, 'pending', translationMask])
      dirtyWS.set(ws, attachment)

      // kenton@cloudflare: No. Only awaiting external I/O counts.
      // Crypto promises are fake, the crypto is actually done synchronously and
      // the promise completes immediately. (If we ever decided to offload crypto
      // to another thread we would make sure it doesn't open the input gate to
      // avoid breaking assumptions.)
      const privateKey = await this.jwt_private_key()

      const sourceImageToken = await new SignJWT({
        f: [task.file],
        p: ['GET'],
      })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuedAt()
        .setAudience('wk:r2:private')
        .setIssuer('wk:gateway:mit')
        .setExpirationTime('5min')
        .sign(privateKey)
      const sourceImageUrl = `${this.env.WKR2_PRIVATE_BASE}/${task.file}?t=${sourceImageToken}`

      const translationMaskToken = await new SignJWT({
        f: [translationMask],
        p: ['PUT'],
      })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuedAt()
        .setAudience('wk:r2:public')
        .setIssuer('wk:gateway:mit')
        .setExpirationTime('5min')
        .sign(privateKey)
      const translationMaskUrl = `${this.env.WKR2_PUBLIC_BASE}/${translationMask}?t=${translationMaskToken}`

      const msg = new WebSocketMessage({
        message: {
          case: 'newTask',
          value: {
            id: task.id,
            sourceImage: sourceImageUrl,
            targetLanguage: task.target_language,
            detector: task.detector,
            direction: task.direction,
            translator: task.translator,
            size: task.size,
            translationMask: translationMaskUrl,
          },
        },
      })
      ws.send(msg.toBinary())
    }

    for (const [ws, attachment] of dirtyWS) {
      // @ts-expect-error missing in types
      ws.serializeAttachment(attachment)
    }

    // since skipped tasks are always before the remaining queue,
    // we can just append them to the start
    this.putQueue(skipped.concat(queue))
  }

  fetch(req: Request): Response | Promise<Response> {
    return this.app().fetch(req)
  }

  webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    // @ts-expect-error missing in types
    const attachment: WsAttachment = ws.deserializeAttachment()
    const ctx: WsMsgContext<WsAttachment> = { ws, msg, attachment }
    switch (attachment.t) {
      case 'wk': {
        return this.handleWorkerMessage(ctx as WsMsgContext<WsWorkerAttachment>)
      }
      case 'ls': {
        return this.handleListenerMessage(ctx as WsMsgContext<WsListenerAttachment>)
      }
      default: {
        ws.close(1011, 'Unknown attachment type')
      }
    }
  }

  async handleWorkerMessage({ ws, msg, attachment }: WsMsgContext<WsWorkerAttachment>) {
    if (typeof msg === 'string') {
      ws.close(1011, 'Invalid message')
      return
    }

    const data = WebSocketMessage.fromBinary(new Uint8Array(msg))
    switch (data.message.case) {
      case 'status': {
        const id = data.message.value.id
        const status = data.message.value.status
        for (const t of attachment.q) {
          if (t[0] === id) {
            t[1] = status

            const listeners = this.state.getWebSockets(`ls:${t[0]}`)
            for (const listener of listeners) {
              listener.send(JSON.stringify({
                type: 'status',
                status,
              } satisfies QueryV1Message))
            }

            // @ts-expect-error missing in types
            ws.serializeAttachment(attachment)

            return
          }
        }

        ws.close(1011, 'Unknown task')
        return
      }
      case 'finishTask': {
        const id = data.message.value.id
        const success = data.message.value.success
        const hasTranslationMask = data.message.value.hasTranslationMask

        const tIndex = attachment.q.findIndex(t => t[0] === id)
        if (tIndex === -1) {
          ws.close(1011, 'Unknown task')
          return
        }

        const task = attachment.q[tIndex]
        attachment.q.splice(tIndex, 1)

        const listeners = this.state.getWebSockets(`ls:${id}`)

        try {
          const updateResult = await this.env.DB
            .prepare('UPDATE task SET state = ?, translation_mask = ? WHERE id = ? RETURNING id')
            .bind(
              success ? dbEnum.taskState.done : dbEnum.taskState.error,
              hasTranslationMask ? task[2] : null,
              id,
            )
            .first<{ id: number } | null>()
          if (!updateResult)
            throw new Error('Task not found')

          const msg = JSON.stringify({
            type: 'result',
            result: {
              translation_mask: hasTranslationMask
                ? `${this.env.WKR2_PUBLIC_EXPOSED_BASE}/${task[2]}`
                : undefined,
            },
          } satisfies QueryV1Message)
          for (const listener of listeners) {
            if (success)
              listener.send(msg)
            // if not successful, the listener would already receive an error status
            listener.close(1000, 'Done')
          }
        }
        catch (err) {
          console.error(String(err instanceof Error ? err.stack : err))
          // pretend the task was errored out
          for (const listener of listeners) {
            listener.send(JSON.stringify({
              type: 'error',
              error: 'error-db',
            } satisfies QueryV1Message))
            listener.close(1011, 'Database error')
          }
        }

        // find the next task
        await this.assignTasks()

        break
      }
      default: {
        ws.close(1011, 'Unknown message type')
      }
    }
  }

  async handleListenerMessage({ ws }: WsMsgContext<WsListenerAttachment>) {
    // listeners cannot send messages for now
    ws.close(1011, 'Invalid message')
  }

  webSocketError(ws: WebSocket, err: any) {
  }

  webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // @ts-expect-error missing in types
    const attachment: WsAttachment = ws.deserializeAttachment()
    const ctx: WsCloseContext<WsAttachment> = { ws, code, reason, wasClean, attachment }
    switch (attachment.t) {
      case 'wk': {
        return this.handleWorkerClose(ctx as WsCloseContext<WsWorkerAttachment>)
      }
      case 'ls': {
        return this.handleListenerClose(ctx as WsCloseContext<WsListenerAttachment>)
      }
    }
  }

  async handleWorkerClose({ attachment }: WsCloseContext<WsWorkerAttachment>) {
    try {
      const delQuery = this.env.DB.prepare('UPDATE task SET state = ? WHERE id = ?')
      // we don't need to await here, the object will not exit
      this.env.DB.batch(attachment.q.map(t => delQuery.bind(dbEnum.taskState.error, t[0])))
    }
    catch (err) {
      console.error(String(err instanceof Error ? err.stack : err))
    }

    for (const t of attachment.q) {
      const listeners = this.state.getWebSockets(`ls:${t[0]}`)
      for (const listener of listeners) {
        listener.send(JSON.stringify({
          type: 'error',
          error: 'error-worker',
        } satisfies QueryV1Message))
        listener.close(1011, 'Worker error')
      }
    }
  }

  async handleListenerClose({ ws }: WsCloseContext<WsListenerAttachment>) {
    // no-op
  }
}

export default {}
