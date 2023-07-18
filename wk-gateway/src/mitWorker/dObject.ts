import { z } from 'zod'
import { SignJWT, importPKCS8, importSPKI } from 'jose'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Bindings, GroupQueryV1Message, QueryV1Message } from '../types'
import { WebSocketMessage } from '../protoGen/gateway.mit_pb'
import { dbEnum } from '../db'
import { BLANK_PNG, memo } from '../utils'
import { createSortableId } from './id'
import { TTLSet } from './ttl'

const QUEUE_CAP = 40
const QUEUE_GC_TARGET = 20
const QUEUE_GC_PICKUP = 4
const QUEUE_GC_PICKUP_COUNT = 4
const QUEUE_KEEP_ALIVE_TIMEOUT = 5 * 1000
const TASK_GROUP_LIMIT = 4

function sendAndClose(data: unknown) {
  const pair = new WebSocketPair()
  // @ts-expect-error Cloudflare only
  pair[1].accept()
  pair[1].send(JSON.stringify(data))
  pair[1].close()
  return new Response(null, { status: 101, webSocket: pair[0] })
}

function withAttachment<T>(ws: WebSocket[]) {
  return ws.map(ws => ({
    // @ts-expect-error Cloudflare specific
    attachment: ws.deserializeAttachment() as T,
    ws,
  }))
}

function mergeGroups(a: string[], b: string[]) {
  const n = a.slice()
  for (const g of b) {
    if (!n.includes(g))
      n.push(g)
  }
  return n
}

export interface MitTask {
  id: string
  group: string[]
  file: string
  target_language: string
  detector: string
  direction: string
  translator: string
  size: string
}

type MitTaskS = [
  // sid
  string,
  {
    group: string[]
  },
]

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
    // group
    string[],
  ][]
}

interface WsListenerAttachment {
  // type: listener
  t: 'ls'
  // task_id
  tid: string
}

interface WsGroupListenerAttachment {
  // type: group_listener
  t: 'lsg'
  // group
  g: string
  // group_time_advancement
  ga: number
}

type WsAttachment =
  WsWorkerAttachment
  | WsListenerAttachment
  | WsGroupListenerAttachment

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
  group: z.string().max(14).optional(),
  file: z.string(),
  target_language: z.string(),
  detector: z.string(),
  direction: z.string(),
  translator: z.string(),
  size: z.string(),
})
export type MitSubmitParam = z.infer<typeof SubmitParam>

export class DOMitWorker implements DurableObject {
  objectCreated = Date.now()
  lastSocketCleanup = this.objectCreated

  queueCache: MitTask[] | undefined
  queueDirty = false
  keepAliveCache = new TTLSet<string>(QUEUE_KEEP_ALIVE_TIMEOUT)
  activeGroupsCache: Map<string, number> | undefined

  jwt_private_key = memo(() => importPKCS8(this.env.JWT_PRIVATE_KEY, 'ES256'))
  jwt_public_key = memo(() => importSPKI(this.env.JWT_PUBLIC_KEY, 'ES256'))

  app = memo(() => new Hono<{ Bindings: Bindings }>()
    .use('*', async (c, next) => {
      if (this.lastSocketCleanup === this.objectCreated
        || Date.now() - this.lastSocketCleanup > 30 * 1000) {
        this.lastSocketCleanup = Date.now()
        Promise.resolve().then(() => this.cleanupSockets())
      }

      await next()
    })
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
      // @ts-expect-error Cloudflare specific
      pair[1].serializeAttachment(attachment)

      // find task for this worker
      await this.assignTasks([pair[1]])

      return new Response(null, { status: 101, webSocket: pair[0] })
    })
    .put('/submit', async ({ req, json }) => {
      const param = SubmitParam.parse(await req.json())

      const task: MitTask = {
        id: param.id,
        group: param.group ? [param.group] : [],
        file: param.file,
        target_language: param.target_language,
        detector: param.detector,
        direction: param.direction,
        translator: param.translator,
        size: param.size,
      }

      const queue = await this.getQueue()

      const mergeGroupsToTask = (oldGroup: string[]) => {
        if (param.group) {
          const group = mergeGroups(oldGroup, task.group)
          if (group.length > TASK_GROUP_LIMIT)
            return json({ id: null, error: 'group-limit' }, { status: 400 })
          this.incActiveGroup(param.group)
          // since task is always new, we can overwrite this
          task.group = group
        }
      }

      // special case: if the task id is already in the queue, replace it with the new task.
      // duplication can happen if there's a force retry request submitted while
      // the old task is still in the queue.
      const pos = queue.findIndex(task => task.id === param.id)
      if (pos !== -1) {
        mergeGroupsToTask(queue[pos].group)
        queue[pos] = task
      }
      else {
        if (queue.length >= QUEUE_CAP && !await this.gcQueue(false, task.group))
        // if the queue is full, reject the request
          return json({ id: null, error: 'queue-full' }, { status: 503 })

        // check if the task is in the backlog
        // will task be pushed to backlog and immediately picked up?
        // no, exsiting tasks don't go to this branch
        const s = await this.state.storage.get<MitTaskS>(`gct:${task.id}`)
        if (s) {
          const [sid, { group }] = s

          mergeGroupsToTask(group)

          // no need to await here, since there's a put queue after
          this.state.storage.delete(`gct:${task.id}`)
          this.state.storage.delete(`gcs:${sid}`)
        }

        queue.push(task)
      }

      this.keepAliveCache.add(task.id)

      await this.putQueue(queue, false)

      // notify workers
      await this.assignTasks(undefined, false)

      await this.flushQueue()

      return json({ id: task.id, pos: pos === -1 ? queue.length : pos })
    })
    .get('/group/event/:group', async ({ req }) => {
      const group = req.param('group')

      if (req.header('Upgrade') !== 'websocket')
        throw new Error('Not a websocket request')

      const pair = new WebSocketPair()

      // because group listener should connect before the task is submitted,
      // we can't deny it here
      // if (!(await this.getActiveGroups()).has(group)) {
      //   // @ts-expect-error Cloudflare specific
      //   pair[1].accept()
      //   pair[1].close(1000, 'Group not found')
      //   return new Response(null, { status: 101, webSocket: pair[0] })
      // }

      this.state.acceptWebSocket(pair[1], ['lsg', `lsg:${group}`])

      const attachment: WsGroupListenerAttachment = { t: 'lsg', g: group, ga: Date.now() }
      // @ts-expect-error Cloudflare specific
      pair[1].serializeAttachment(attachment)

      return new Response(null, { status: 101, webSocket: pair[0] })
    })
    .get('/status/:id', async ({ req, json }) => {
      const id = req.param('id')

      this.keepAliveCache.add(id)

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
      // return a json response to let the upstream worker know.
        return json({ type: 'not_found' })

      const pair = new WebSocketPair()

      this.state.acceptWebSocket(pair[1], ['ls', `ls:${id}`])

      const attachment: WsListenerAttachment = { t: 'ls', tid: id }
      // @ts-expect-error Cloudflare specific
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
    }))

  constructor(public state: DurableObjectState, public env: Bindings) {
    // this.state.blockConcurrencyWhile(() => this.getQueue())
  }

  async getQueue(): Promise<MitTask[]> {
    if (this.queueCache === undefined)
      this.queueCache = await this.state.storage.get<MitTask[]>('queue') ?? []
    return this.queueCache
  }

  async putQueue(queue: MitTask[], flush: boolean) {
    this.queueCache = queue
    this.queueDirty = true
    if (flush)
      this.flushQueue()
  }

  async flushQueue() {
    if (this.queueDirty) {
      await this.state.storage.put('queue', this.queueCache)
      this.queueDirty = false
    }
  }

  async getActiveGroups(
    workers = withAttachment<WsWorkerAttachment>(this.state.getWebSockets('wk')),
  ): Promise<Map<string, number>> {
    if (this.activeGroupsCache !== undefined)
      return this.activeGroupsCache

    const groups = []
    for (const { attachment } of workers) {
      for (const task of attachment.q)
        groups.push(...task[3])
    }
    for (const task of await this.getQueue())
      groups.push(...task.group)

    const map = new Map<string, number>()
    if (groups.length === 0)
      return this.activeGroupsCache = map

    groups.sort()
    let prev = groups[0]
    let count = 1
    for (let i = 1; i < groups.length; i++) {
      if (groups[i] !== prev) {
        map.set(prev, count)
        prev = groups[i]
        count = 1
      }
      else {
        count++
      }
    }
    map.set(prev, count)

    return this.activeGroupsCache = map
  }

  async incActiveGroup(group: string) {
    const map = await this.getActiveGroups()
    const count = map.get(group) ?? 0
    map.set(group, count + 1)

    // since this method can be considered as a "renew" for the group,
    // we'll renew listeners attached to the group as well
    const groupListeners = withAttachment<WsGroupListenerAttachment>(this.state.getWebSockets(`lsg:${group}`))
    for (const { ws, attachment } of groupListeners) {
      attachment.ga = Date.now()
      // @ts-expect-error Cloudflare specific
      ws.serializeAttachment(attachment)
    }
  }

  async decActiveGroup(group: string): Promise<boolean> {
    const map = await this.getActiveGroups()
    const count = map.get(group) ?? 0
    if (count === 1) {
      map.delete(group)
      return true
    }
    else {
      map.set(group, count - 1)
      return false
    }
  }

  isTaskAlive(
    task: MitTask,
    listeners = withAttachment<WsListenerAttachment>(this.state.getWebSockets('ls')),
    groupListeners = withAttachment<WsGroupListenerAttachment>(this.state.getWebSockets('lsg')),
  ): boolean {
    return this.keepAliveCache.has(task.id)
      || listeners.some(({ attachment }) => attachment.tid === task.id)
      || groupListeners.some(({ attachment }) => task.group.includes(attachment.g))
  }

  async gcQueue(force = false, skipGroup: string[] = []): Promise<boolean> {
    const queue = await this.getQueue()
    if (!force && queue.length <= QUEUE_GC_TARGET)
      return false

    const listeners = withAttachment<WsListenerAttachment>(this.state.getWebSockets('ls'))
    const groupListeners = withAttachment<WsGroupListenerAttachment>(this.state.getWebSockets('lsg'))

    const newQueue = []
    let left = queue.length - QUEUE_GC_TARGET
    for (let i = 0; i < queue.length; i++) {
      if (left <= 0) {
        newQueue.push(...queue.slice(i))
        break
      }

      const task = queue[i]

      if (skipGroup.some(g => task.group.includes(g)))
        continue

      // keep tasks with listeners
      if (this.isTaskAlive(task, listeners, groupListeners)) {
        newQueue.push(task)
        continue
      }

      // put task in backlog
      const sid = createSortableId()
      // we'll await later
      this.state.storage.put<MitTask>(`gcs:${sid}`, task)
      // we need two indexes, another for deletion on submit
      this.state.storage.put<MitTaskS>(`gct:${task.id}`, [sid, { group: task.group }])

      for (const g of task.group)
        await this.decActiveGroup(g)

      left--
    }
    if (newQueue.length !== queue.length) {
      // force flush here to ensure the put above is being committed
      await this.putQueue(newQueue, true)
      return true
    }

    return false
  }

  async gcPickup() {
    const queue = await this.getQueue()
    if (queue.length > QUEUE_GC_PICKUP)
      return

    const tasks = await this.state.storage.list<MitTask>({
      prefix: 'gcs:',
      limit: QUEUE_GC_PICKUP_COUNT,
    })
    if (tasks.size === 0)
      return

    const newTasks = Array.from(tasks.values())

    for (const task of newTasks) {
      for (const g of task.group)
        await this.incActiveGroup(g)
    }

    const newQueue = queue.concat(newTasks)
    this.state.storage.delete(Array.from(tasks.keys()))
    this.state.storage.delete(newTasks.map(task => `gct:${task.id}`))

    await this.putQueue(newQueue, true)
  }

  async findTaskStatus(id: string): Promise<QueryV1Message> {
    // since there's probably always less workers than tasks,
    // we can first iterate through all workers
    const workers = this.state.getWebSockets('wk')
    for (const worker of workers) {
      // @ts-expect-error Cloudflare specific
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

  async assignTasks(workers = this.state.getWebSockets('wk'), pickup = true) {
    if (workers.length === 0)
      return

    if (pickup)
      await this.gcPickup()

    let workerWithAttachments = workers.map((ws) => {
      // @ts-expect-error Cloudflare specific
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
      attachment.q.push([task.id, 'pending', translationMask, task.group])
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

      Promise.resolve()
        .then(() => this.env.DB
          .prepare('UPDATE task SET last_attempted_at = ? WHERE id = ?')
          .bind(new Date().toISOString(), task.id)
          .run(),
        )
    }

    for (const [ws, attachment] of dirtyWS) {
      // @ts-expect-error Cloudflare specific
      ws.serializeAttachment(attachment)
    }

    // since skipped tasks are always before the remaining queue,
    // we can just append them to the start
    this.putQueue(skipped.concat(queue), true)
  }

  fetch(req: Request): Response | Promise<Response> {
    return this.app().fetch(req, this.env)
  }

  webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    // @ts-expect-error Cloudflare specific
    const attachment: WsAttachment = ws.deserializeAttachment()
    const ctx: WsMsgContext<WsAttachment> = { ws, msg, attachment }
    switch (attachment.t) {
      case 'wk': {
        return this.handleWorkerMessage(ctx as WsMsgContext<WsWorkerAttachment>)
      }
      case 'ls': {
        return this.handleListenerMessage(ctx as WsMsgContext<WsListenerAttachment>)
      }
      case 'lsg':{
        return this.handleGroupListenerMessage(ctx as WsMsgContext<WsGroupListenerAttachment>)
      }
      default: {
        // eslint-disable-next-line unused-imports/no-unused-vars
        const never: never = attachment
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
        for (const task of attachment.q) {
          if (task[0] === id) {
            task[1] = status

            const listeners = this.state.getWebSockets(`ls:${task[0]}`)
            const groupListeners = task[3].map(g => this.state.getWebSockets(`lsg:${g}`)).flat()

            const data = {
              type: 'status',
              status,
            } as const
            const msg = JSON.stringify(data satisfies QueryV1Message)
            for (const listener of listeners)
              listener.send(msg)
            const gmsg = JSON.stringify({ id: task[0], ...data } satisfies GroupQueryV1Message)
            for (const listener of groupListeners)
              listener.send(gmsg)

            // @ts-expect-error Cloudflare specific
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
        const groupListeners = task[3].map(g => this.state.getWebSockets(`lsg:${g}`)).flat()

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

          if (success) {
            const data = {
              type: 'result',
              result: {
                translation_mask: hasTranslationMask
                  ? `${this.env.WKR2_PUBLIC_EXPOSED_BASE}/${task[2]}`
                  : BLANK_PNG,
              },
            } as const
            const msg = JSON.stringify(data satisfies QueryV1Message)
            for (const listener of listeners) {
              listener.send(msg)
              listener.close(1000, 'Done')
            }
            const gmsg = JSON.stringify({ id, ...data } satisfies GroupQueryV1Message)
            for (const listener of groupListeners)
              listener.send(gmsg)
          }
          else {
            for (const listener of listeners)
              // if not successful, the listener would already receive an error status
              listener.close(1011, 'Done')
          }
        }
        catch (err) {
          console.error(String(err instanceof Error ? err.stack : err))
          // pretend the task was errored out
          const data = {
            type: 'error',
            error: 'error-db',
          } as const
          const msg = JSON.stringify(data satisfies QueryV1Message)
          for (const listener of listeners) {
            listener.send(msg)
            listener.close(1011, 'Database error')
          }
          const gmsg = JSON.stringify({ id, ...data } satisfies GroupQueryV1Message)
          for (const listener of groupListeners)
            listener.send(gmsg)
        }

        for (const group of task[3])
          await this.decActiveGroup(group)

        for (const { ws, attachment } of withAttachment<WsGroupListenerAttachment>(groupListeners)) {
          attachment.ga = Date.now()
          // @ts-expect-error Cloudflare specific
          ws.serializeAttachment(attachment)
        }

        // @ts-expect-error Cloudflare specific
        ws.serializeAttachment(attachment)

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

  async handleGroupListenerMessage({ ws }: WsMsgContext<WsGroupListenerAttachment>) {
    // listeners cannot send messages for now
    ws.close(1011, 'Invalid message')
  }

  webSocketError(ws: WebSocket, err: any) {
  }

  webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // @ts-expect-error Cloudflare specific
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
      // no need to await here, the object will not exit
      this.env.DB.batch(attachment.q.map(t => delQuery.bind(dbEnum.taskState.error, t[0])))
    }
    catch (err) {
      console.error(String(err instanceof Error ? err.stack : err))
    }

    for (const task of attachment.q) {
      const listeners = this.state.getWebSockets(`ls:${task[0]}`)
      const groupListeners = task[3].map(g => this.state.getWebSockets(`lsg:${g}`)).flat()

      const data = {
        type: 'error',
        error: 'error-worker',
      } as const
      const msg = JSON.stringify(data satisfies QueryV1Message)
      for (const listener of listeners) {
        listener.send(msg)
        listener.close(1011, 'Worker error')
      }
      const gmsg = JSON.stringify({ id: task[0], ...data } satisfies GroupQueryV1Message)
      for (const listener of groupListeners)
        listener.send(gmsg)

      for (const group of task[3])
        await this.decActiveGroup(group)

      for (const { ws, attachment } of withAttachment<WsGroupListenerAttachment>(groupListeners)) {
        attachment.ga = Date.now()
        // @ts-expect-error Cloudflare specific
        ws.serializeAttachment(attachment)
      }
    }
  }

  async handleListenerClose({ ws }: WsCloseContext<WsListenerAttachment>) {
    // no-op
  }

  async cleanupSockets() {
    // cleanup stale group listeners
    const now = Date.now()
    const groupListeners = withAttachment<WsGroupListenerAttachment>(this.state.getWebSockets('lsg'))
    for (const { ws, attachment } of groupListeners) {
      const hasActiveGroup = (await this.getActiveGroups()).has(attachment.g)

      if (!hasActiveGroup && now - attachment.ga > 60 * 1000) {
        ws.close(1011, 'Timeout')
        continue
      }
    }
  }
}

export default {}
