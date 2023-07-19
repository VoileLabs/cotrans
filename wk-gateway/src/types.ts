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
  doImage: DurableObjectNamespace
  wkr2_private: Fetcher
  wkr2_public: Fetcher
}
