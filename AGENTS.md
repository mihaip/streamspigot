# Stream Spigot Agent Notes

## Project Overview

Stream Spigot is a collection of tools for consuming real time-ish data sources at a manageable pace. The active application is the Cloudflare/SvelteKit worker in `worker/`. The old App Engine implementation and retired tools live in `legacy/` for reference only.

Masto Feeder signs in with Mastodon, reads the user's timeline, and renders it as an Atom feed or debug HTML. Sky Feeder signs in with Bluesky through AT Protocol OAuth, reads the user's home timeline, and renders it as Atom, JSON Feed, or debug HTML. Tweeter Feeder reads public Twitter/X timelines through private web endpoints and renders them through the same shared feed/status pipeline.

## Active Architecture

- SvelteKit routes live under `worker/src/routes`.
- Masto Feeder request handling is centralized in `worker/src/lib/masto-feeder/controller.ts`.
- The controller owns auth/session/KV concerns and delegates timeline feed rendering to `worker/src/lib/masto-feeder/feed.ts`.
- `worker/src/lib/masto-feeder/feed.ts` fetches Mastodon API data and adapts statuses into provider-neutral status objects.
- Tweeter Feeder request handling is centralized in `worker/src/lib/tweeter-feeder/controller.ts`.
- `worker/src/lib/tweeter-feeder/fetcher.ts` handles Twitter/X auth, private GraphQL fetches, response parsing, session cooldowns, and caching.
- `worker/src/lib/tweeter-feeder/status-adapter.ts` converts parsed Twitter/X tweets into provider-neutral `Status` objects.
- Sky Feeder request handling is centralized in `worker/src/lib/sky-feeder/controller.ts`.
- `worker/src/lib/sky-feeder/oauth.ts` builds the AT Protocol OAuth client, exposes client metadata/JWKS data, and restores OAuth sessions.
- `worker/src/lib/sky-feeder/feed.ts` fetches the Bluesky home timeline with `@atproto/api`.
- `worker/src/lib/sky-feeder/status-adapter.ts` converts Bluesky feed posts, reposts, quotes, images, videos, and external cards into provider-neutral `Status` objects.
- Small shared feeder helpers live in `worker/src/lib/feeder`.
- `worker/src/lib/status/feed.ts` renders normalized statuses as Atom or debug HTML with `svelte/server`.
- Shared feed-reader-friendly status UI lives in `worker/src/lib/components`, centered on `StatusDisplay.svelte` and related `StatusDisplay*` components.
- Provider-neutral status types live in `worker/src/lib/status`.

## Tweeter Feeder Twitter/X Data Loading

Tweeter Feeder does not use the official Twitter/X developer API. It follows the
same general approach as [Nitter](https://github.com/zedeus/nitter): make
authenticated requests to Twitter/X's private web GraphQL endpoints, then adapt
the returned web-client JSON into a stable local shape. Use Nitter as the
reference implementation for provider quirks, endpoint behavior, and timeline
parsing details, but keep the Stream Spigot implementation small and focused on
feed generation.

Runtime sessions are stored in KV under `tweeter-feeder:sessions`. Each session
is a cookie-derived credential bundle with `auth_token` and `ct0`. The fetcher
builds browser-like request headers and sends a matching `ct0` cookie and
`x-csrf-token` header to the private GraphQL API.

The high-level fetch flow is:

1. Normalize requested usernames and choose an available session deterministically.
2. Resolve each screen name to a Twitter/X user id with `UserResultByScreenNameQuery`.
3. Fetch that user's timeline with `UserTweets`.
4. Parse users, tweets, reposts, quotes, cards, polls, media, entities, and profile images out of the GraphQL response.
5. Cache parsed user and timeline results in KV, and temporarily cool down sessions that hit auth or rate-limit style failures.
6. Convert parsed Twitter/X tweets to the shared `Status` shape before rendering with the common Atom/debug HTML renderer.

Twitter/X private endpoints and response shapes change without notice. When auth
or parsing breaks, compare the current web-client request with `fetcher.ts`,
check that `ct0` is complete and matches in both cookie and header, and consult
the Nitter repo for the closest known handling of current Twitter/X behavior.

## Sky Feeder Bluesky Data Loading

Sky Feeder uses AT Protocol OAuth rather than app passwords. It depends on
`@atproto/api` and `@atproto/oauth-client-node`; keep `nodejs_compat` enabled
in both Wrangler configs. The deployed Worker also needs the
`ATPROTO_OAUTH_PRIVATE_JWK` secret. Generate it from `worker/` with
`npm run gen:atproto-key`, then store the generated JSON object with
`wrangler secret put ATPROTO_OAUTH_PRIVATE_JWK`.

AT Protocol discoverable OAuth client IDs must be HTTPS URLs that are not
loopback hosts and can be fetched by the Bluesky/ATProto OAuth server. Local
HTTP is enough to smoke-test `/sky-feeder`,
`/sky-feeder/oauth-client-metadata.json`, and `/sky-feeder/jwks.json`, but a
complete Bluesky sign-in requires the deployed HTTPS Worker URL or a public
HTTPS tunnel such as Tailscale Funnel pointed at the local Vite dev server.

Sky Feeder data is stored in KV under `sky-feeder:` keys. OAuth state entries
expire quickly; OAuth sessions are keyed by DID; Stream Spigot UI/feed sessions
have their own random `sessionId` and `feedId`. Do not revoke the OAuth session
on UI sign-out, because the randomly generated feed URL should continue to
work.
The `SkyOAuthLock` Durable Object serializes AT Protocol OAuth refreshes per DID
so concurrent feed requests do not replay the same refresh token.

The high-level fetch flow is:

1. Normalize the entered Bluesky handle and start AT Protocol OAuth.
2. Store the OAuth callback session by DID, then create or update the Sky Feeder session and random feed ID.
3. Restore the OAuth session for feed requests and call `agent.getTimeline`.
4. Page through recent timeline results until the 12-hour window is exhausted, or one page in debug mode.
5. Convert `app.bsky.feed.defs#feedViewPost` objects to the shared `Status` shape before rendering with the common Atom/JSON/debug HTML renderer.

## Status Display Pattern

Provider API objects must stop at adapter boundaries. Shared Svelte display components should render normalized display objects and must not import Mastodon, Bluesky, Twitter/X, or other provider SDK types.

For Masto Feeder, `worker/src/lib/masto-feeder/status-adapter.ts` is the Mastodon adapter. It converts `masto` statuses into generic `Status` objects and keeps Mastodon-specific behavior there, including local URL generation, content/title cleanup, quote handling, YouTube iframe extraction, SkyBridge image filtering, reply parent URLs, and debug JSON.

For Sky Feeder, `worker/src/lib/sky-feeder/status-adapter.ts` is the Bluesky adapter. Keep AT Protocol record/view objects out of shared Svelte components. Map rich text facets to HTML, reposts to `StatusRepost`, quote embeds to nested `Status`, media embeds to attachments, and external embeds to cards at the adapter boundary.

Future provider tools should add provider-specific fetch/auth code and adapters that produce the same `Status` shape. They should reuse the shared display components rather than forking provider-specific markup.

Use plain serializable status data for the shared contract. Avoid presenter classes in the shared status layer unless there is a concrete need that cannot be handled by adapter-side normalization.

## Svelte Guidance

Use current Svelte 5 patterns:

- declare component inputs with typed `$props()`
- treat props as read-only
- use `$derived` for values derived from props
- keep server feed rendering through `render` from `svelte/server`

When working with Svelte, SvelteKit, Cloudflare Workers, Wrangler, or other libraries/frameworks/tools, use Context7 MCP to fetch current docs before relying on remembered API details.

## Development Commands

Run commands from `worker/` unless noted otherwise.

- `npm install` installs dependencies.
- `npm run dev` starts the canonical SvelteKit dev server on `localhost:3413`, with HMR and local Cloudflare bindings such as `STREAMSPIGOT` KV.
- `npm run gen:atproto-key` generates a private JWK JSON object for the `ATPROTO_OAUTH_PRIVATE_JWK` secret used by Sky Feeder OAuth.
- `npm run types:worker` regenerates `worker-configuration.d.ts` from Wrangler binding config.
- `npm run check` verifies generated Worker types, then runs Svelte and TypeScript checks.
- `npm run build` builds the app.
- `npm run preview` builds and previews the SvelteKit output on `localhost:4413`.
- `npm run preview:worker` builds and starts Wrangler Worker-runtime preview on `localhost:5413`.
- `npm run deploy` builds and deploys with Wrangler.

Wrangler deploy config lives in `worker/wrangler.toml` and points at
`.svelte-kit/cloudflare/_worker.js` with static assets in
`.svelte-kit/cloudflare`. Worker type generation uses `worker/wrangler.types.toml`,
which mirrors the deployed bindings but intentionally omits `main` and
`assets.directory` so `worker-configuration.d.ts` does not import generated
build output during `svelte-check`. Keep `wrangler.toml` and
`wrangler.types.toml` binding declarations in sync.

## Testing And Verification

Use the Masto Feeder timeline debug query parameters when checking feed output:

- `debug=true` fetches fewer posts.
- `html=true` returns debug HTML instead of Atom.
- `includeStatusJson=true` includes source status JSON.

For display changes, compare normal posts, boosts/reposts, content warnings, quote posts, image/video/gifv attachments, polls, link cards, YouTube embeds, and reply footer links. Atom entries should keep stable `id`, `link`, `title`, `published`, `updated`, and HTML content fields.

For Worker/dev tooling changes, verify all three local paths when feasible:
`npm run dev` on port 3413, `npm run preview` on port 4413, and
`npm run preview:worker` on port 5413. Smoke-test `/` and the KV-backed
`/tweeter-feeder/statusz` endpoint; `statusz` should return `ok: true` when
local Tweeter Feeder sessions are configured. For Sky Feeder, also smoke-test
`/sky-feeder`, `/sky-feeder/oauth-client-metadata.json`, and
`/sky-feeder/jwks.json` with a local `ATPROTO_OAUTH_PRIVATE_JWK` value.
End-to-end Bluesky OAuth requires non-loopback HTTPS, for example through
Tailscale Funnel.

## Code Style Notes

Follow the existing TypeScript/Svelte style: strict types, 4-space indentation, double quotes, semicolons, and concise comments only where behavior is non-obvious. Preserve feed-reader-oriented inline styles in status display components unless deliberately changing rendered output.

Prefer entrypoint-first file organization: put the primary exported type, component logic, or public function near the top of a file, then place child types and helper functions below it. For adapter modules, start with the main adapter function and keep provider-specific helpers underneath.

Before committing code changes, run the relevant formatting and verification
scripts from `worker/`: `npm run format`, `npm run lint`, `npm run check`, and
`npm run build`. If a change only touches docs outside `worker/`, note that the
Worker verification was intentionally skipped.

## Commit Message Style

When asked to commit, use the repo's established style: concise but explanatory. Start with a short imperative subject line that says what changed, not a generic label. Follow with a brief body that captures the motivation, context, and any subtle behavior details that would be hard to recover from the diff alone.

Keep commit bodies focused: one or two paragraphs is usually enough. Use bullets when a change has several distinct parts or reasons. Prefer concrete context such as provider quirks, API semantics, feed-reader behavior, or why a fallback exists. Avoid verbose implementation inventories, marketing language, and restating every touched file.
