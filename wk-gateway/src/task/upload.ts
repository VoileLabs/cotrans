import { z } from 'zod'
import type { Handler, HonoRequest } from 'hono'
import { ofetch } from 'ofetch'
import { createId } from '@paralleldrive/cuid2'
import type { Bindings } from '../types'
import { dbEnum } from '../db'
import type { MitSubmitParam } from '../mitWorker/dObject'

const FILE_SIZE_LIMIT = 20 * 1024 * 1024
const WORKER_REVISION = 3

const DEFAULT_DIRECTION = {
  CHS: 'auto',
  CHT: 'auto',
  CSY: 'h',
  NLD: 'h',
  ENG: 'h',
  FRA: 'h',
  DEU: 'h',
  HUN: 'h',
  ITA: 'h',
  JPN: 'auto',
  KOR: 'auto',
  PLK: 'h',
  PTB: 'h',
  ROM: 'h',
  RUS: 'h',
  ESP: 'h',
  TRK: 'h',
  UKR: 'h',
  VIN: 'h',
}

const ParamBase = z.object({
  retry: z.boolean().or(z.string().transform(v => v === 'true')).optional(),
  group: z.string().max(14).optional(),

  mime: z.string().optional(),

  target_language: z.enum([
    'CHS', 'CHT', 'CSY', 'NLD', 'ENG', 'FRA', 'DEU', 'HUN', 'ITA', 'JPN',
    'KOR', 'PLK', 'PTB', 'ROM', 'RUS', 'ESP', 'TRK', 'UKR', 'VIN',
  ]),
  detector: z.enum(['default', 'ctd']),
  direction: z
    .enum(['default', 'auto', 'h', 'v', 'horizontal', 'vertical'])
    .transform((s) => {
      switch (s) {
        case 'horizontal':
          return 'h'
        case 'vertical':
          return 'v'
        default:
          return s
      }
    }),
  translator: z.enum(['gpt3.5', 'youdao', 'baidu', 'google', 'deepl', 'papago', 'gpt3.5', 'offline', 'none', 'original']),
  size: z.enum(['S', 'M', 'L', 'X']),
})

const Param = z.union([
  ParamBase.extend({
    file: z
      .instanceof(Blob)
      .refine(blob => blob.size > 0 && blob.size < FILE_SIZE_LIMIT),
    url: z.undefined(),
  }),
  ParamBase.extend({
    file: z.undefined(),
    url: z.string().url(),
  }),
])

export async function parseBody(req: HonoRequest): Promise<z.infer<typeof Param>> {
  const contentType = req.header('Content-Type') ?? ''
  if (contentType.startsWith('application/json'))
    return Param.parse(await req.json())
  else if (contentType.startsWith('multipart/form-data')
    || contentType.startsWith('application/x-www-form-urlencoded'))
    return Param.parse(await req.parseBody())
  else
    throw new Error('Unsupported content type')
}

export const upload: Handler<{ Bindings: Bindings }> = async ({ env, req, json }) => {
  const param = await parseBody(req)
  // eslint-disable-next-line no-console
  console.debug('param', param)

  const retry = param.retry ?? req.method === 'POST'

  const direction = param.direction === 'default'
    ? DEFAULT_DIRECTION[param.target_language]
    : param.direction

  const file: Blob = param.file
    ?? await fetch(param.url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Origin': new URL(param.url).origin,
        'Referer': param.url,
      },
    }).then((res) => {
      if (Number.parseInt(res.headers.get('content-length')!) > FILE_SIZE_LIMIT)
        throw new Error('File too large')
      param.mime = param.mime || res.headers.get('content-type') || undefined
      return res.blob()
    })

  const uploadForm = new FormData()
  uploadForm.append('file', file)
  if (param.mime)
    uploadForm.append('mime', param.mime)

  const sourceInfo = await env.image.fetch('https://fake-host/', {
    method: 'POST',
    body: uploadForm,
  }).then(res => res.json<{
    key: string
    width: number
    height: number
    size: number
    hash: string
    sha: string
  }>())

  const tempSourceId = createId()
  const sourceResult = await env.DB
    .prepare(`
INSERT INTO source_image (id, hash, file, size, width, height)
VALUES (?1, ?2, ?3, ?4, ?5, ?6)
ON CONFLICT(file) DO UPDATE SET hash = ?2, size = ?4, width = ?5, height = ?6
RETURNING id
`)
    .bind(tempSourceId, sourceInfo.hash, sourceInfo.key, sourceInfo.size, sourceInfo.width, sourceInfo.height)
    .first<{ id: string }>()
  const sourceId = sourceResult.id

  const tempTaskId = createId()

  let taskId: string
  if (retry) {
    const taskResult = await env.DB
      .prepare(`
INSERT INTO task (id, source_image_id, target_language, detector, direction, translator, size, worker_revision)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
ON CONFLICT DO UPDATE SET state = ?9, translation_mask = NULL
RETURNING id, state, translation_mask
`)
      .bind(tempTaskId, sourceId, param.target_language, param.detector, direction, param.translator, param.size, WORKER_REVISION, dbEnum.taskState.pending)
      .first<{ id: string; state: number; translation_mask: string | null }>()
    taskId = taskResult.id
  }
  else {
    const exsitingTaskResult = await env.DB
      .prepare(`
SELECT id, state, translation_mask FROM task
WHERE
  source_image_id IN (SELECT id FROM source_image WHERE hash = ?1)
  AND target_language = ?2
  AND detector = ?3
  AND direction = ?4
  AND translator = ?5
  AND size = ?6
  AND worker_revision = ?7
ORDER BY last_attempted_at DESC
LIMIT 1
`)
      .bind(sourceInfo.hash, param.target_language, param.detector, direction, param.translator, param.size, WORKER_REVISION)
      .first<{ id: string; state: number; translation_mask: string | null } | null>()

    if (exsitingTaskResult?.state === dbEnum.taskState.done) {
      return json({
        id: exsitingTaskResult.id,
        result: {
          translation_mask: `${env.WKR2_PUBLIC_EXPOSED_BASE}/${exsitingTaskResult.translation_mask}`,
        },
      })
    }

    // we're being optimistic here,
    // if there's a race creating two similar tasks, we'll process both
    const newTaskResult = await env.DB
      .prepare(`
INSERT INTO task (id, source_image_id, target_language, detector, direction, translator, size, worker_revision)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
ON CONFLICT DO UPDATE SET dummy = 0
RETURNING id, state, translation_mask
`)
      .bind(tempTaskId, sourceId, param.target_language, param.detector, direction, param.translator, param.size, WORKER_REVISION)
      .first<{ id: string; state: number; translation_mask: string | null }>()

    // if *somehow* a tasks inserted and finished within the probably sub-100ms window,
    // we'll return that as well
    if (newTaskResult.state === dbEnum.taskState.done) {
      return json({
        id: newTaskResult.id,
        result: {
          translation_mask: `${env.WKR2_PUBLIC_EXPOSED_BASE}/${newTaskResult.translation_mask}`,
        },
      })
    }

    taskId = newTaskResult.id
  }

  // task is new
  const task: MitSubmitParam = {
    id: taskId,
    group: param.group,
    file: sourceInfo.key,
    target_language: param.target_language,
    detector: param.detector,
    direction,
    translator: param.translator,
    size: param.size,
  }
  const mitWorkerId = env.doMitWorker.idFromName('default')
  const mitWorkerResult = await ofetch('https://fake-host/submit', {
    fetcher: env.doMitWorker.get(mitWorkerId, { locationHint: 'enam' }),
    method: 'PUT',
    body: task,
  })

  return json(mitWorkerResult)
}
