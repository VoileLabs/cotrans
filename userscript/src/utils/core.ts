import type { Accessor } from 'solid-js'
import { BCP47ToISO639, realLang, t } from '../i18n'
import {
  detectionResolution,
  renderTextOrientation,
  targetLang,
  textDetector,
  translatorService,
} from './storage'
import { formatProgress } from '.'

export async function resizeToSubmit(blob: Blob, suffix: string): Promise<{ blob: Blob; suffix: string }> {
  const blobUrl = URL.createObjectURL(blob)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = err => reject(err)
    img.src = blobUrl
  })
  URL.revokeObjectURL(blobUrl)

  const w = img.width
  const h = img.height

  if (w <= 4096 && h <= 4096)
    return { blob, suffix }

  // resize to less than 6k
  const scale = Math.min(4096 / w, 4096 / h)
  const width = Math.floor(w * scale)
  const height = Math.floor(h * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  const newBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob)
        resolve(blob)
      else
        reject(new Error('Canvas toBlob failed'))
    }, 'image/png')
  })

  // console.log(`resized from ${w}x${h}(${formatSize(blob.size)},${suffix}) to ${width}x${height}(${formatSize(newBlob.size)},png)`)

  return {
    blob: newBlob,
    suffix: 'png',
  }
}

export interface TaskResult {
  translation_mask: string
}

export interface TranslateOptionsOverwrite {
  detectionResolution?: string
  renderTextOrientation?: string
  textDetector?: string
  translator?: string
  forceRetry?: boolean
}
export async function submitTranslate(
  blob: Blob,
  suffix: string,
  listeners: {
    onProgress?: (progress: string) => void
  } = {},
  optionsOverwrite?: TranslateOptionsOverwrite,
): Promise<{
  id: string
  status: string
  result?: TaskResult
}> {
  const { onProgress } = listeners

  const formData = new FormData()
  formData.append('file', blob, `image.${suffix}`)
  formData.append('target_language', targetLang() || BCP47ToISO639(realLang()))
  formData.append('detector', optionsOverwrite?.textDetector ?? textDetector())
  formData.append('direction', optionsOverwrite?.renderTextOrientation ?? renderTextOrientation())
  formData.append('translator', optionsOverwrite?.translator ?? translatorService())
  formData.append('size', optionsOverwrite?.detectionResolution ?? detectionResolution())
  formData.append('retry', optionsOverwrite?.forceRetry ? 'true' : 'false')

  const result = await GMP.xmlHttpRequest({
    method: 'POST',
    url: 'https://api.cotrans.touhou.ai/task/upload/v1',
    // @ts-expect-error FormData is supported
    data: formData,
    upload: {
      onprogress: onProgress
        ? (e: ProgressEvent) => {
            if (e.lengthComputable) {
              const p = formatProgress(e.loaded, e.total)
              onProgress(p)
            }
          }
        : undefined,
    },
  })

  // console.log(result.responseText)
  return JSON.parse(result.responseText)
}

export function getStatusText(msg: QueryV1Message): Accessor<string> {
  if (msg.type === 'pending')
    return t('common.status.pending-pos', { pos: msg.pos })
  if (msg.type === 'status')
    return t(`common.status.${msg.status}`)
  return t('common.status.default')
}

type QueryV1Message = {
  type: 'pending'
  pos: number
} | {
  type: 'status'
  status: string
} | {
  type: 'result'
  result: {
    translation_mask: string
  }
} | {
  type: 'error'
  error_id?: string
} | {
  type: 'not_found'
}

export function pullTranslationStatus(id: string, cb: (status: Accessor<string>) => void) {
  const ws = new WebSocket(`wss://api.cotrans.touhou.ai/task/${id}/event/v1`)

  return new Promise<TaskResult>((resolve, reject) => {
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as QueryV1Message
      if (msg.type === 'result')
        resolve(msg.result)
      else if (msg.type === 'error')
        reject(t('common.status.error-with-id', { id: msg.error_id }))
      else
        cb(getStatusText(msg))
    }
  })
}

export async function pullTranslationStatusPolling(id: string, cb: (status: Accessor<string>) => void) {
  while (true) {
    const res = await GMP.xmlHttpRequest({
      method: 'GET',
      url: `https://api.cotrans.touhou.ai/task/${id}/status/v1`,
    })
    const msg = JSON.parse(res.responseText) as QueryV1Message
    if (msg.type === 'result')
      return msg.result
    else if (msg.type === 'error')
      throw t('common.status.error-with-id', { id: msg.error_id })
    else
      cb(getStatusText(msg))

    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

export async function downloadBlob(
  url: string,
  listeners: {
    onProgress?: (progress: string) => void
  } = {},
): Promise<Blob> {
  const { onProgress } = listeners

  const res = await GMP.xmlHttpRequest({
    method: 'GET',
    responseType: 'blob',
    url,
    onprogress: onProgress
      ? (e) => {
          if (e.lengthComputable) {
            const p = formatProgress(e.loaded, e.total)
            onProgress(p)
          }
        }
      : undefined,
  })

  return res.response as Blob
}

export async function blobToImageData(blob: Blob): Promise<ImageData> {
  const blobUrl = URL.createObjectURL(blob)

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = err => reject(err)
    img.src = blobUrl
  })
  URL.revokeObjectURL(blobUrl)

  const w = img.width
  const h = img.height

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, w, h)
}

export async function imageDataToBlob(imageData: ImageData): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(imageData, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob)
        resolve(blob)
      else
        reject(new Error('Canvas toBlob failed'))
    }, 'image/png')
  })

  return blob
}
