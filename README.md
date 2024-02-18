# Cotrans

A working-in-progress collaborative online image/manga translation platform base on
[manga-image-translator](https://github.com/zyddnys/manga-image-translator).

## Contributing

### Repository structure

| Path         | Description                |
| ------------ | -------------------------- |
| `docs`       | Documentations             |
| `specs`      | OpenAPI specs (TODO)       |
| `proto`      | Protobuf definitions       |
| `proto-rs`   | Prost definitions          |
| `migrations` | Database migrations        |
| `types`      | TypeScript definitions     |
| `wk-gateway` | Gateway worker             |
| `wk-image`   | Image processing worker    |
| `img_hash`   | Fork of `image_hasher`     |
| `wkr2`       | R2 worker (private/public) |
| `web`        | Website                    |
| `web-ext`    | Browser extension          |
| `userscript` | UserScript                 |

#### Service structure

```mermaid
flowchart TB

browser <--> |HTTP| web["web @ cotrans.touhou.ai"]

userscript <--> |HTTP| web

browser <--> |HTTP,WS| wk-gateway["wk-gateway @ api.cotrans.touhou.ai"]

wk-gateway --> doImage
wk-gateway --> doMitWorker
wk-gateway --> cotrans
wk-gateway --> wkr2-private
wk-gateway --> wkr2-public

wk-gateway-domitworker --> doMitWorker
wk-gateway-domitworker --> cotrans

wk-image --> cotrans-private
wk-image --> doImage

wkr2-public <--> cotrans-public[cotrans-public: images]
wkr2-private <--> cotrans-private[cotrans-private: images]

subgraph pages[CF page]
    web
end

subgraph workers[CF worker]
    wk-gateway
    wk-gateway-domitworker
    wk-image
    wkr2-public
    wkr2-private
end

subgraph do["CF durable object"]
    doMitWorker
    doImage
end

subgraph d1["CF D1 database"]
    cotrans[Relational DB for translation tasks]
end

subgraph buckets["CF buckets"]
    cotrans-public
    cotrans-private
end

workers --> do
do --> buckets
do --> d1

```
