# Stream Spigot

Stream Spigot is a collection of tools to make consumption of real time-ish datasources more manageable. The active tool is **Masto Feeder**, which lets you read your Mastodon timeline in a feed reader.

A running instance is at [www.streamspigot.com](http://www.streamspigot.com/).

The implementation is a Cloudflare Worker in the [`worker/`](worker/) directory. Earlier tools (Tweet Digest, Feed Playback, Bird Feeder) and the original App Engine implementation are preserved in [`legacy/`](legacy/).

## Development

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

The [main timeline handler](https://github.com/mihaip/streamspigot/blob/main/worker/src/routes/masto-feeder/feed/%5BfeedId%5D/timeline/+server.ts#L13) has support for a few query parameters to help with testing:

- `debug=true`: show fewer posts (just the 10 most recent ones) to speed up loading
- `html=true`: return HTML instead of an Atom feed, for easier in-browser viewing
- `includeStatusJson=true`: include the full JSON of each status for introspection

## Tweeter Feeder sessions

Tweeter Feeder fetches public X/Twitter timelines through the same private web
endpoints used by [Nitter](https://github.com/zedeus/nitter). It does not use
a developer API key. Runtime credentials, cached user/timeline responses, and
session cooldown markers are stored in the existing `STREAMSPIGOT` KV namespace
binding under `tweeter-feeder:` keys.

Sessions are stored as one JSON array at the KV key `tweeter-feeder:sessions`.
To generate a session object manually:

1. Log in to `https://x.com` as the account you want Tweeter Feeder to use.
2. Open browser DevTools.
3. Go to **Application** → **Storage** → **Cookies** → `https://x.com`.
4. Copy these cookie values from the table:
   - `auth_token`
   - `ct0`
   - `twid`, optional but useful. It looks like `u%3D123456`; use the number
     after `u%3D` as the `id`.
5. Switch to the Console and paste this snippet, replacing the placeholders
   with the copied values:

   ```js
   copy(
     JSON.stringify({
       kind: "cookie",
       username: "digest1",
       id: "123456",
       auth_token: "paste auth_token here",
       ct0: "paste ct0 here",
     }),
   );
   ```

6. Add the copied object to the `tweeter-feeder:sessions` JSON array in KV.

For local `wrangler dev`, open
[`localhost:5413/cdn-cgi/explorer`](http://localhost:5413/cdn-cgi/explorer),
select the `STREAMSPIGOT` KV binding, and create or update:

- Key: `tweeter-feeder:sessions`
- Value: a JSON array containing the session object from above

For production, edit the same key in the Cloudflare dashboard or with Wrangler
against the production KV namespace. Multiple accounts are supported by adding
multiple objects to the array. The fetcher chooses sessions deterministically by
requested username and temporarily cools down sessions that hit auth or
rate-limit errors.

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
