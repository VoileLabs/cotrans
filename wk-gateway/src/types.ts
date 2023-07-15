// FIXME Type '{ Bindings: Bindings; }' does not satisfy the constraint 'Env'.
// Types of property 'Bindings' are incompatible.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Bindings = {
  // TODO use mTLS
  MIT_WORKERS_SECRET: string

  JWT_PRIVATE_KEY: string
  JWT_PUBLIC_KEY: string

  WKR2_PRIVATE_BASE: string
  WKR2_PUBLIC_BASE: string
  WKR2_PUBLIC_EXPOSED_BASE: string

  DB: D1Database
  doMitWorker: DurableObjectNamespace
  image: Fetcher
  wkr2_private: Fetcher
  wkr2_public: Fetcher
}

export interface TaskResult {
  translation_mask?: string
}

export interface QueryV1MessagePending {
  type: 'pending'
  pos: number
}
export interface QueryV1MessageStatus {
  type: 'status'
  status: string
}
export interface QueryV1MessageResult {
  type: 'result'
  result: TaskResult
}
export interface QueryV1MessageError {
  type: 'error'
  error_id?: string | null
  error?: string | null
}
export interface QueryV1MessageNotFound {
  type: 'not_found'
}
export type QueryV1Message =
  | QueryV1MessagePending
  | QueryV1MessageStatus
  | QueryV1MessageResult
  | QueryV1MessageError
  | QueryV1MessageNotFound

export type GroupQueryV1Message = QueryV1Message & {
  id: string
}
