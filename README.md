# Stream Spigot

Stream Spigot is a collection of tools to make consumption of real time-ish datasources more manageable. The active tool is **Masto Feeder**, which lets you read your Mastodon timeline in a feed reader.

A running instance is at [www.streamspigot.com](http://www.streamspigot.com/).

## Development

The current implementation is a Cloudflare Worker in the [`worker/`](worker/) directory.

Install dependencies:

```bash
cd worker
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

The [main timeline handler](worker/src/routes/masto-feeder/feed/%5BfeedId%5D/timeline/+server.ts) has support for a few query parameters to help with testing:

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

It will be running at [streamspigot.mihai-parparita.workers.dev](https://streamspigot.mihai-parparita.workers.dev).

## Legacy

Earlier tools (Tweet Digest, Feed Playback, Bird Feeder) and the original App Engine implementation are preserved in the [`legacy/`](legacy/) directory.
