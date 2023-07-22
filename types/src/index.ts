/* eslint-disable @typescript-eslint/ban-types */

export interface TaskResult {
  /**
   * The URL to a mask layer to be applied on top of the original image.
   *
   * When the mask is empty, this value will be a URI of exactly:<br>
   * `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQI12NgYAAAAAMAASDVlMcAAAAASUVORK5CYII=`<br>
   * Which is a transparent 1x1 PNG image.<br>
   * This image is only meant for backwards compatibility, and the client should skip masking in this case.
   *
   * @example
   * 'https://r2.cotrans.touhou.ai/mask/h4zjxwhjshl68pgfkwcad0w9.png'
   */
  translation_mask: string
}

export interface QueryV1MessagePending {
  /**
   * Indicates that the task is still in the queue.
   */
  type: 'pending'
  /**
   * The image's position in the queue, starts at 1.
   */
  pos: number
}

export interface QueryV1MessageStatus {
  /**
   * Streamed status updates for the task.
   */
  type: 'status'
  /**
   * The current status of the task.<br>
   * Current possible values are listed in the type, but more may be added in the future.
   *
   * Values beginning with `error-` should be considered as errors.
   * Upon receiving such message, the client will be disconnected shortly after,
   * without receiving an `error` message.
   */
  status: string & {}
  // cat manga_translator.py | sed -n -E "/server_send_status\(websocket, task\.id, |\.status\.status = |_report_progress\('/s/^.*'([^']+)'.*$/| '\1'/p" | sort | uniq
  | 'colorizing'
  | 'detection'
  | 'downloading'
  | 'downscaling'
  | 'error'
  | 'error-download'
  | 'error-lang'
  | 'error-translating'
  | 'error-upload'
  | 'finished'
  | 'inpainting'
  | 'mask-generation'
  | 'ocr'
  | 'pending'
  | 'preparing'
  | 'rendering'
  | 'saved'
  | 'saving'
  | 'skip-no-regions'
  | 'skip-no-text'
  | 'textline_merge'
  | 'translating'
  | 'uploading'
  | 'upscaling'
}

export interface QueryV1MessageResult {
  /**
   * Indicates that the task has finished and the result is available.
   */
  type: 'result'
  /**
   * The result of the task.
   */
  result: TaskResult
}

export interface QueryV1MessageError {
  /**
   * Indicates that the task has encountered an error.
   */
  type: 'error'
  /**
   * A unique identifier given each occurrence of an error.
   *
   * @example 'tz4a98xxat96iws9zmbrgj3a'
   */
  error_id?: string | null
  /**
   * An identifier for the error type.<br>
   * Current possible values are listed in the type, but more may be added in the future.
   */
  error?: string & {} | null
  | 'error-db'
  | 'error-worker'
}

export interface QueryV1MessageNotFound {
  /**
   * The given task id was not found in neither the queue nor the database.
   */
  type: 'not_found'
}

/**
 * A message returned by the `/task/:id/status/v1` or `/task/:id/event/v1` endpoint.
 */
export type QueryV1Message =
  | QueryV1MessagePending
  | QueryV1MessageStatus
  | QueryV1MessageResult
  | QueryV1MessageError
  | QueryV1MessageNotFound

/**
 * A message returned by the `/group/:group/event/v1` endpoint.
 */
export type GroupQueryV1Message = QueryV1Message & {
  /**
   * The id of the task.
   */
  id: string
}

/**
 * Indicates the task has been successfully processed or was added to the queue.
 */
export interface UploadV1ResultSuccess {
  /**
   * The id of the task.
   */
  id: string
  /**
   * The image's position in the queue, starts at 1.
   */
  pos?: number | null
  /**
   * The result of the task, if it was already processed.
   */
  result?: TaskResult | null
}

/**
 * Indicates the task could not be processed.
 */
export interface UploadV1ResultError {
  id: null
  /**
   * An identifier for the error type.<br>
   * Current possible values are listed in the type, but more may be added in the future.
   *
   * `group-limit`: The task has been binded to too many groups.<br>
   * `queue-full`: The queue is full.<br>
   * `fetch-failed`: The url could not be fetched. (only for `url` uploads)<br>
   * `file-too-large`: The file is too large. Currently the limit is 20MiB.<br>
   * `resize-crash`: The resize process crashed, usually due to insufficient memory.
   * This can happen if the image has very large dimensions, or if the image is corrupted,
   * or if the image uses a color type outside of `RGB`, `RGBA`, `L`, `LA`.
   * The general guideline is to keep the image dimensions below 4096x4096.<br>
   */
  error?: string & {} | null
  | 'group-limit'
  | 'queue-full'
  | 'fetch-failed'
  | 'file-too-large'
  | 'resize-crash'
}

/**
 * The result of the `/task/upload/v1` endpoint.
 */
export type UploadV1Result = UploadV1ResultSuccess | UploadV1ResultError
