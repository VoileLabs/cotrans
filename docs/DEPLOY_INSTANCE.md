# Instance Deploy Guide

This guide is exclusively designed for developers who are interested in deploying
their own version of Cotrans. If your intention is to process images on your personal computer,
you should instead refer to the [Translation Worker Deploy Guide](./DEPLOY_WORKER.md).

## Requirements

You must have:

- A Cloudflare account
  - with an active zone (domain)
    - if nameserver changes haven't been applied, wait for it first
  - with Workers Paid plan (<https://dash.cloudflare.com/?to=/:account/workers/plans>)
  - with Durable Objects activated (from the bottom of any Worker's page)
  - with R2 plan (<https://dash.cloudflare.com/?to=/:account/r2/plans>)
- Any Linux server (to process tasks)
  - with Python 3.8+ installed
  - if equipped with Nvidia GPU, with the latest PyTorch + CUDA installed
  - recommended minimum 28GB RAM, or 16GB RAM with 16GB GPU VRAM
  - exposing to the Internet is *not* required

## Preparation

Install the following tools:

- Node.js 18+ (<https://nodejs.org/download/current/>)
  - with `pnpm` (<https://pnpm.io/installation>)
  - with `wrangler` (`pnpm i -g wrangler`)
- Rust 1.68+ (<https://rustup.rs/>)

```bash
# Generate a pair of ECDSA private/public key (to sign/verify JWT)
# Results will be saved in `private.pem` and `public.pem`
openssl ecparam -name prime256v1 -genkey -noout | tee >(openssl ec -pubout -out public.pem) | openssl pkcs8 -topk8 -nocrypt -out private.pem

# Clone the repo
git clone https://github.com/VoileLabs/cotrans
cd cotrans

# Install dependencies
cargo check
pnpm i

# Build the project
pnpm build
```

## Deploy R2 buckets and `wkr2`

Create two R2 buckets in Cloudflare dashboard: `cotrans-public`, `cotrans-private`.

Bind a custom domain to the `cotrans-public` bucket.
This domain will be referred as `r2.cotrans.example.com` in the following steps.

Add a CORS policy, with `GET` method allowed.

An example policy:

```json
[
  {
    "AllowedOrigins": [
      "*"
    ],
    "AllowedMethods": [
      "GET"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 600
  }
]
```

Run the following commands to deploy `cotrans-wkr2-public` and `cotrans-wkr2-private`:

```bash
cd wkr2
wrangler deploy --keep-vars
wrangler deploy --keep-vars --env private
```

Open the settings page of both workers, click "Variables", and add the following environment variables:

- `JWT_PUBLIC_KEY`: the content of `public.pem`
- `JWT_AUDIENCE`: `wk:r2:private` for `cotrans-wkr2-private`, `wk:r2:public` for `cotrans-wkr2-public`

Scroll down to the "R2 Bucket Bindings" section, ensure a bucket is bound to `BUCKET`.
If not, click "Edit variable" and add a bucket named `BUCKET`, to `cotrans-public` for `wkr2-public`, `cotrans-private` for `wkr2-private`.

Open the triggers page, add a custom domain for each worker.
The domains will be referred as `public.r2.wk.cotrans.example.com` and `private.r2.wk.cotrans.example.com` in the following steps.

Both workers are recommended be in "Bundled" usage model.

## Deploy `wk-image`

Run the following commands to deploy `wk-image`:

```bash
cd wk-image
wrangler deploy --keep-vars
```

Open the settings page of the worker, ensure a bucket is bound to `BUCKET_PRI`.
If not, click "Edit variable" and add a bucket named `BUCKET_PRI`, to `cotrans-private`.

The worker must be in "Unbound" usage model.

## Deploy `wk-gateway`

Create a D1 database in Cloudflare dashboard, named `cotrans`.

Edit `wk-gateway/wrangler.toml`, replace the value of `database_id` with the ID of the database.

Edit `wk-gateway/src/index.ts`, put the domain for `web` inside `CORS_ORIGINS`.

Run the following commands to deploy `cotrans-wk-gateway`:

```bash
cd wk-gateway
wrangler d1 migrations apply DB --experimental-backend
wrangler deploy --keep-vars -c wrangler.domitworker.toml
wrangler deploy --keep-vars
```

This should produce two workers: `cotrans-wk-gateway-domitworker` and `cotrans-wk-gateway`.

Open the settings page of both workers, do the following:

- Click "Variables", and add the following environment variables:
  - `JWT_PRIVATE_KEY`: the content of `private.pem`
  - `JWT_PUBLIC_KEY`: the content of `public.pem`
  - `MIT_WORKERS_SECRET`: a random string, used by the Linux server to authenticate itself
    - Try using a password generator if you don't know what to put
  - `WKR2_PRIVATE_BASE`: `https://private.r2.wk.cotrans.example.com`
  - `WKR2_PUBLIC_BASE`: `https://public.r2.wk.cotrans.example.com`
  - `WKR2_PUBLIC_EXPOSED_BASE`: `https://r2.cotrans.example.com`
- Scroll down to the "Durable Object Bindings" section, ensure the following bindings exist:
  - `doMitWorker`: bind to `cotrans-wk-gateway-domitworker_DOMitWorker`
  - `doImage`: bind to `cotrans-wk-image_DOImage`
  - If not, click "Edit variable" and add the bindings.
- Scroll down to the "Service Bindings" section, ensure the following bindings exist:
  - `wkr2_private`: bind to `cotrans-wkr2-private`
  - `wkr2_public`: bind to `cotrans-wkr2-public`
  - If not, click "Edit variable" and add the bindings.
- On `cotrans-wk-gateway`, open the triggers page, add a custom domain, this will be the api domain.
  - The domain will be referred as `gateway.wk.cotrans.example.com` in the following steps.

Both workers are recommended be in "Bundled" usage model.

## Deploy `web`

Run the following commands to deploy `web`:

```bash
cd web
NUXT_PUBLIC_API_BASE=https://gateway.wk.cotrans.example.com NUXT_PUBLIC_WS_BASE=wss://gateway.wk.cotrans.example.com pnpm generate
wrangler pages deploy .output/public
```

Bind a custom domain to the worker, this will be the website domain.

## Deploy mit workers

SSH into the Linux server, follow the instructions in <https://github.com/zyddnys/manga-image-translator#installation>.

Set the api keys in `.env` file for translation services you plan to use.

Replace `<MIT_WORKERS_SECRET>` in the following commands with the value of `MIT_WORKERS_SECRET` in `cotrans-wk-gateway`'s environment variables.

```bash
WS_SECRET=<MIT_WORKERS_SECRET> python -m manga_translator --use-cuda --mode ws --ws-url wss://gateway.wk.cotrans.example.com/mit/worker_ws
```

Congratulations! Your website should be able to translate images now.
