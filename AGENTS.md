# Stream Spigot Agent Notes

## Project Overview

Stream Spigot is a collection of tools for consuming real time-ish data sources at a manageable pace. The active application is the Cloudflare/SvelteKit worker in `worker/`. The old App Engine implementation and retired tools live in `legacy/` for reference only.

Masto Feeder is the active tool today. It signs in with Mastodon, reads the user's timeline, and renders it as an Atom feed or debug HTML.

## Active Architecture

- SvelteKit routes live under `worker/src/routes`.
- Masto Feeder request handling is centralized in `worker/src/lib/masto-feeder/controller.ts`.
- The controller owns auth/session/KV concerns and delegates timeline feed rendering to `worker/src/lib/masto-feeder/feed.ts`.
- `worker/src/lib/masto-feeder/feed.ts` fetches Mastodon API data and adapts statuses into provider-neutral status objects.
- `worker/src/lib/status/feed.ts` renders normalized statuses as Atom or debug HTML with `svelte/server`.
- Shared feed-reader-friendly status UI lives in `worker/src/lib/components`, centered on `StatusDisplay.svelte` and related `StatusDisplay*` components.
- Provider-neutral status types live in `worker/src/lib/status`.

## Status Display Pattern

Provider API objects must stop at adapter boundaries. Shared Svelte display components should render normalized display objects and must not import Mastodon, Bluesky, Twitter/X, or other provider SDK types.

For Masto Feeder, `worker/src/lib/masto-feeder/status-adapter.ts` is the Mastodon adapter. It converts `masto` statuses into generic `Status` objects and keeps Mastodon-specific behavior there, including local URL generation, content/title cleanup, quote handling, YouTube iframe extraction, SkyBridge image filtering, reply parent URLs, and debug JSON.

Future Bluesky or Twitter/X tools should add provider-specific fetch/auth code and adapters that produce the same `Status` shape. They should reuse the shared display components rather than forking Mastodon-specific markup.

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
- `npm run dev` starts the SvelteKit dev server on `localhost:3413`.
- `npm run worker-dev` starts Wrangler dev for Cloudflare-specific functionality such as KV.
- `npm run check` runs Svelte and TypeScript checks.
- `npm run build` builds the app.
- `npm run preview` previews the build on `localhost:4413`.
- `npm run worker-deploy` deploys with Wrangler.

## Testing And Verification

Use the Masto Feeder timeline debug query parameters when checking feed output:

- `debug=true` fetches fewer posts.
- `html=true` returns debug HTML instead of Atom.
- `includeStatusJson=true` includes source status JSON.

For display changes, compare normal posts, boosts/reposts, content warnings, quote posts, image/video/gifv attachments, polls, link cards, YouTube embeds, and reply footer links. Atom entries should keep stable `id`, `link`, `title`, `published`, `updated`, and HTML content fields.

## Code Style Notes

Follow the existing TypeScript/Svelte style: strict types, 4-space indentation, double quotes, semicolons, and concise comments only where behavior is non-obvious. Preserve feed-reader-oriented inline styles in status display components unless deliberately changing rendered output.

Prefer entrypoint-first file organization: put the primary exported type, component logic, or public function near the top of a file, then place child types and helper functions below it. For adapter modules, start with the main adapter function and keep provider-specific helpers underneath.

## Commit Message Style

When asked to commit, use the repo's established style: concise but explanatory. Start with a short imperative subject line that says what changed, not a generic label. Follow with a brief body that captures the motivation, context, and any subtle behavior details that would be hard to recover from the diff alone.

Keep commit bodies focused: one or two paragraphs is usually enough. Use bullets when a change has several distinct parts or reasons. Prefer concrete context such as provider quirks, API semantics, feed-reader behavior, or why a fallback exists. Avoid verbose implementation inventories, marketing language, and restating every touched file.
