import { importSPKI, jwtVerify } from 'jose'
import { z } from 'zod'

export interface Env {
  JWT_PUBLIC_KEY: string
  JWT_AUDIENCE: string
  BUCKET: R2Bucket
}

const JWTSchema = z.object({
  // files
  f: z.array(z.string()).optional(),
  // directories
  d: z.array(z.string().endsWith('/')).optional(),
  // permissions
  p: z.array(z.enum(['GET', 'PUT', 'DELETE'])),
})

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const jwt_public_key = await importSPKI(env.JWT_PUBLIC_KEY, 'ES256')

    const url = new URL(request.url)
    const file = url.pathname.slice(1)
    const token = url.searchParams.get('t')

    if (token === null)
      return new Response(JSON.stringify({ code: 'missing_token' }), { status: 400 })

    // parse token
    let jwt: z.infer<typeof JWTSchema>
    try {
      const verified = await jwtVerify(token, jwt_public_key, {
        algorithms: ['ES256'],
        // issuer: 'wk:gateway:mit',
        audience: env.JWT_AUDIENCE,
        maxTokenAge: '4h',
      })
      jwt = JWTSchema.parse(verified.payload)
      if (!jwt.f?.length && !jwt.d?.length)
        throw new Error('Missing file or directory')
    }
    catch (error) {
      console.error(String(error instanceof Error ? error.stack : error))
      return new Response(JSON.stringify({ code: 'invalid_token' }), { status: 400 })
    }

    // check permissions
    if (!jwt.p.includes(request.method as never))
      return new Response(JSON.stringify({ code: 'forbidden' }), { status: 403 })

    // check if file is in scope
    if (
      (jwt.f?.length && !jwt.f.includes(file))
      && (jwt.d?.length && !jwt.d.some(d => file.startsWith(d)))
    )
      return new Response(JSON.stringify({ code: 'forbidden' }), { status: 403 })

    // handle request
    switch (request.method) {
      case 'PUT': {
        const obj = await env.BUCKET.put(file, request.body)
        return new Response(JSON.stringify({ code: 'ok', file, size: obj.size }))
      }

      case 'GET': {
        const obj = await env.BUCKET.get(file)

        if (obj === null)
          return new Response(JSON.stringify({ code: 'not_found' }), { status: 404 })

        const headers = new Headers()
        obj.writeHttpMetadata(headers)
        headers.set('etag', obj.httpEtag)

        return new Response(obj.body, { headers })
      }

      case 'DELETE': {
        await env.BUCKET.delete(file)
        return new Response(JSON.stringify({ code: 'ok', file }))
      }

      default:
        return new Response(JSON.stringify({ code: 'method_not_allowed' }), { status: 405 })
    }
  },
}
