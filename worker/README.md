# Cloudflare Worker

In-development replacement of the App Engine app with a Cloudflare Worker.

## Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

It will be running at [localhost:3413](http://localhost:3413/).

If working on things that need Cloudflare-specific functionality (e.g. KV namespaces) then you'll need to start the worker in dev mode:

```bash
npm run worker-dev
```

It will be running at [localhost:5413](http://localhost:5413/).

The [main timeline handler](https://github.com/mihaip/streamspigot/blob/main/worker/src/routes/masto-feeder/feed/%5BfeedId%5D/timeline/+server.ts#L13) has support for a few query parameters to help with testing:

- `debug=true`: show fewer posts (just the 10 most recent ones) to speed up loading
- `html=true`: return HTML instead of an Atom feed, for easier in-browser viewing
- `includeStatusJson=true`: include the full JSON of each status for introspection

## Building

To build and run a preview version:

```bash
npm run build
npm run preview
```

It will be running at [localhost:4413](http://localhost:4413/).

## Deployment

To deploy the app, assuming you've run `wrangler login` to set up Cloudflare credentials:

```bash
npm run worker-deploy
```

It will be running at [streamspigot.mihai-parparita.workers.dev](https://streamspigot.mihai-parparita.workers.dev)
