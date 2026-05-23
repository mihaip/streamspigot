# Stream Spigot

Stream Spigot is a collection of tools to make consumption of real time-ish datasources more manageable. The active tools are:
- **Masto Feeder**: lets you read your Mastodon timeline in a feed reader.
- **Tweeter Feeder**: lets you generate feeds for public X/Twitter accounts.
- **Sky Feeder**: lets you read your Bluesky timeline in a feed reader.

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

It will be running at [localhost:3413](http://localhost:3413/). This is the
normal development loop, including SvelteKit HMR and local Cloudflare bindings.

To test the built Cloudflare Worker runtime locally, use:

```bash
npm run preview:worker
```

It will be running at [localhost:5413](http://localhost:5413/).

Wrangler binding types are generated into `worker-configuration.d.ts`:

```bash
npm run types:worker
```

`npm run check` verifies that those generated types are up to date before
running Svelte and TypeScript checks. The type generation uses
`wrangler.types.toml`, which mirrors the deployed bindings without importing
the generated Worker build output into `svelte-check`.

## Sky Feeder

Sky Feeder signs in with Bluesky through AT Protocol OAuth, stores OAuth and
feed sessions in the existing `STREAMSPIGOT` KV namespace, and renders the home
timeline through the shared Atom/JSON Feed status renderer. It uses
`@atproto/api` and `@atproto/oauth-client-node`, so the Worker config enables
`nodejs_compat`.

Before using Sky Feeder in a deployed environment, generate an OAuth signing key
and store it as a Wrangler secret:

```bash
cd worker
npm run gen:atproto-key
wrangler secret put ATPROTO_OAUTH_PRIVATE_JWK
```

Paste the generated JSON object as the secret value. The public key is exposed
automatically from `/sky-feeder/jwks.json`, and OAuth client metadata is exposed
from `/sky-feeder/oauth-client-metadata.json`.

AT Protocol discoverable OAuth client IDs must be HTTPS URLs that are not
loopback hosts and can be fetched by the Bluesky/ATProto OAuth server. Local
HTTP is enough to smoke-test `/sky-feeder`, the metadata route, and the JWKS
route, but real Bluesky sign-in requires the deployed HTTPS Worker URL or a
public HTTPS tunnel such as Tailscale Funnel pointed at the local Vite dev
server.

# Masto Feeder

The [main timeline handler](https://github.com/mihaip/streamspigot/blob/main/worker/src/routes/masto-feeder/feed/%5BfeedId%5D/timeline/+server.ts#L13) has support for a few query parameters to help with testing:

- `debug=true`: show fewer posts (just the 10 most recent ones) to speed up loading
- `output=html`: return HTML instead of an Atom feed, for easier in-browser viewing
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

For local Worker runtime preview, run `npm run preview:worker`, then open
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
npm run preview
```

It will be running at [localhost:4413](http://localhost:4413/).

## Deployment

To deploy the app, assuming you've run `wrangler login` to set up Cloudflare credentials:

```bash
npm run deploy
```

It will be running at [streamspigot.mihai-parparita.workers.dev](https://streamspigot.mihai-parparita.workers.dev) (alternate/development route for the main `www.streamspigot.com` domain route).
