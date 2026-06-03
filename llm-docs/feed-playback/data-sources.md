# Feed Playback Data Sources

Research date: 2026-06-03

## Goal

The legacy Feed Playback tool depended on Google Reader as both the historical
feed archive and the output feed host. It looked up all historical item IDs for
a feed, chose a start position by timestamp, then advanced playback by adding
one more original item to a public Google Reader tag feed.

Relevant legacy references:

- `legacy/app/datasources/googlereader.py`
- `legacy/app/feedplayback/data.py`
- `legacy/app/feedplayback/handlers.py`

A resurrected version cannot rely on another service to keep the output feed.
It should import or reconstruct historical feed items, store normalized item
content locally, then serve playback feeds from Stream Spigot.

## High-level finding

There does not appear to be a modern general-purpose equivalent to Google
Reader's corpus that guarantees every item ever published for an arbitrary RSS
feed URL.

The practical approach is a layered importer:

1. Read the current feed and publisher-provided archive feeds.
2. Follow standardized feed archive/paging links where present.
3. Stitch historical snapshots from Internet Archive Wayback.
4. Optionally import from reader services with user authentication, especially
   NewsBlur Premium Archive.
5. Use site-specific fallbacks such as WordPress REST APIs, sitemaps, and
   podcast indexes when applicable.
6. Store provenance and confidence per item so playback can report gaps instead
   of claiming perfect completeness.

## Recommended source order

### 1. Current feed

Use the live RSS/Atom URL first. Some publishers include the whole archive in
the current feed, especially podcasts and low-volume blogs.

Pros:

- Highest fidelity when complete.
- No external archive dependency.
- Gives canonical feed metadata and item identity fields.

Cons:

- Most feeds are a sliding window over recent items.
- Truncated feeds may not include full content.
- Feed IDs and dates can change or be unreliable.

Implementation notes:

- Parse RSS, Atom, RDF RSS, and JSON Feed if accepted as an input variant.
- Store both publisher dates and fetch dates.
- Detect likely completeness with item count, oldest date, `fh:complete`, and
  whether the feed type is podcast-like.

### 2. RFC 5005 feed paging and archiving

[RFC 5005: Feed Paging and Archiving](https://www.rfc-editor.org/rfc/rfc5005.html)
defines complete feeds, paged feeds, and archived feeds.

Important details:

- `fh:complete` marks a single feed document as representing all entries in the
  logical feed.
- Paged feeds use link relations such as `first`, `last`, `previous`, and
  `next`, but RFC 5005 says paged feeds are lossy and should not be treated as
  coherent or complete.
- Archived feeds use `prev-archive`, `next-archive`, `current`, and
  `fh:archive`. These are intended to let clients reconstruct the logical feed.
- Duplicate handling should prefer the most recently updated duplicate entry,
  and Atom duplicates are identified by `atom:id`.

Pros:

- Standardized and publisher-controlled.
- Can be complete when publishers use archived feeds correctly.

Cons:

- Rarely implemented.
- Paged feeds are useful for discovery but are explicitly not a completeness
  guarantee.

Implementation notes:

- Follow `prev-archive` recursively from the subscription document.
- Treat `next`/`previous` pagination as lower-confidence discovery unless the
  feed also advertises archive semantics.
- Apply a crawl budget and cycle detection.

### 3. Publisher pagination heuristics

NewsBlur's Premium Archive backfill uses two practical techniques: appending
`?page=2` and `?paged=2` to feed URLs, and following RFC 5005 archive links.
See the
[NewsBlur Premium Archive launch post](https://blog.newsblur.com/2022/07/01/premium-archive-subscription/).

Pros:

- Can work well on WordPress and similar CMS feeds.
- Often gives better item content than web archive snapshots.

Cons:

- Non-standard.
- Can loop, repeat the same feed page, or accidentally crawl unrelated pages.
- Needs strict dedupe and stop conditions.

Implementation notes:

- Try known variants only after the canonical feed has been parsed:
  `?page=N`, `?paged=N`, `/page/N/`, and CMS-specific feed pagination where
  safely detectable.
- Stop when page content digest repeats, all items are older than an already
  seen page, or a page has no new item IDs.
- Record these items as publisher-derived but heuristic.

### 4. Internet Archive Wayback snapshots

This is the strongest general public source for arbitrary feed URLs.

Use the Wayback CDX API to list captures of the feed URL, fetch raw archived
feed snapshots, parse every snapshot, then dedupe items.

Sources:

- [Internet Archive developer tutorial for comparing snapshots](https://archive.org/developers/tutorial-compare-snapshot-wayback)
- [Wayback CDX server README](https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md)
- [Backfeed API docs](https://backfeed.app/api-docs.php), an existing service
  that reconstructs feeds from Wayback snapshots

Useful CDX query shape:

```text
https://web.archive.org/cdx/search/cdx
  ?url=<feed-url>
  &output=json
  &fl=timestamp,original,mimetype,statuscode,digest,length
  &filter=statuscode:200
  &collapse=digest
```

Relevant CDX features:

- `output=json` returns field names and rows.
- `fl=` limits returned fields.
- `from=` and `to=` filter by timestamp.
- `filter=` can filter fields such as `statuscode` and `mimetype`.
- `collapse=digest` removes adjacent duplicate captures.
- `limit=`, `showResumeKey=true`, and `resumeKey=` support large result sets.

Pros:

- Public and broadly applicable.
- Can recover items that no current feed or reader account exposes.
- Snapshot timestamps make gaps visible.

Cons:

- Not complete. Snapshot frequency varies, and feeds can be excluded or missing.
- A fast-moving feed may publish and drop items between snapshots.
- Archived snapshots can be redirects, errors, `warc/revisit` records, or
  rewritten HTML rather than raw XML.
- Feed URL canonicalization matters: `http` vs `https`, trailing slash,
  query parameters, FeedBurner URLs, and redirects can split history.
- Full content may be absent if the feed only contained summaries.

Implementation notes:

- Query several canonical URL variants:
  original input URL, discovered canonical feed URL, final redirected URL,
  `http` and `https` variants, and common FeedBurner or CMS aliases when known.
- Prefer successful XML-ish captures, but also attempt parse-by-content because
  feed MIME types are often wrong.
- Fetch archived payloads in raw/no-rewrite mode when possible.
- Dedupe first by strong ID (`guid`, Atom `id`), then by canonical link, then by
  title plus normalized published date.
- Preserve all source observations for an item, including first-seen snapshot,
  last-seen snapshot, source digest, and source URL.
- Use snapshot time only as a fallback date. Prefer item `published`,
  `pubDate`, or Atom `updated`.
- Record archive gaps by comparing adjacent snapshot dates and item churn.

Existing precedent:

- [Backfeed](https://backfeed.app/) turns Wayback snapshots into a deduplicated
  historical feed. It is useful as proof that the approach works, but direct
  CDX ingestion gives more control over provenance, dedupe, and item storage.

### 5. NewsBlur

NewsBlur is the most promising reader-backed source.

Sources:

- [NewsBlur API](https://www.newsblur.com/api)
- [NewsBlur Premium Archive launch post](https://blog.newsblur.com/2022/07/01/premium-archive-subscription/)

Relevant API capabilities:

- `GET /rss_feeds/search_feed` finds feed information from a website or feed
  address.
- `GET /reader/feed/:id` retrieves stories from a single feed and supports
  `page`, `order`, `read_filter`, date filters, `include_hidden`,
  `include_story_content`, and `query`.
- `GET /reader/river_stories` retrieves stories from multiple feeds and supports
  page/order/date filters.
- `GET /rss_feeds/original_text` can retrieve extracted full text for a story.
- Authentication is required. OAuth is available by request, or session cookie
  authentication can be used for personal tooling.

Premium Archive findings:

- NewsBlur advertises that every story from every subscribed site is archived
  and searchable forever for Premium Archive subscribers.
- It backfills feeds that support paging for a complete archive.
- Its backfill techniques include `?page=2`, `?paged=2`, and RFC 5005 links.

Pros:

- Purpose-built feed reader corpus.
- API exposes story content and pagination.
- Premium Archive may provide backfilled history that Wayback missed.

Cons:

- Requires a NewsBlur account and likely a Premium Archive subscription.
- Archive completeness depends on NewsBlur having subscribed/backfilled the feed
  and on what the API exposes for that account.
- It may be inappropriate as a public backend dependency unless each Stream
  Spigot user connects their own account.

Implementation notes:

- Treat NewsBlur as an optional authenticated importer, not the default source.
- Test whether `GET /reader/feed/:id?order=oldest&read_filter=all` pages back to
  the advertised archive for subscribed feeds.
- Store NewsBlur story hashes as source IDs but still map to provider-neutral
  item IDs.

### 6. Feedly

Feedly is promising but not yet proven as a full archive API source.

Sources:

- [Feedly article retention help](https://docs.feedly.com/article/372-do-you-mark-articles-older-than-30-days-as-read)
- [Feedly continuation docs](https://developers.feedly.com/docs/understanding-continuation)
- [Feedly collect articles endpoint](https://developers.feedly.com/reference/collect-articles)
- [Feedly search API docs](https://developers.feedly.com/docs/using-the-search-api)

Findings:

- Feedly says articles older than 30 days are marked read, but all articles stay
  in Feedly indefinitely and the full indexed history can be accessed in the UI
  by showing all articles.
- The streams API uses continuation tokens to fetch older articles in pages.
- The collect articles endpoint supports `streamID`, `count`, `olderThan`, and
  `continuation`.
- Several API paths limit `newerThan` to 31 days. That does not necessarily
  prevent paging older content, but it means this needs real account testing.

Pros:

- Large reader corpus.
- Continuation-based paging is a good fit for import.

Cons:

- API access appears oriented toward Feedly enterprise or team integrations.
- Full historical access through API is uncertain.
- Authentication and account setup are heavier than Wayback.

Implementation notes:

- Treat Feedly as an experimental connector until tested with an old feed.
- Verify whether continuation from `/v3/streams/contents` can walk past 31 days
  for an ordinary feed stream.
- Record Feedly IDs as source IDs only.

### 7. Inoreader

Inoreader has a Google Reader-like API, but the documented stream behavior
limits its usefulness for old backfills.

Source:

- [Inoreader stream contents API](https://www.inoreader.com/developers/stream-contents)

Relevant API capabilities:

- `https://www.inoreader.com/reader/api/0/stream/contents/[streamId]`
  returns JSON items for a feed, tag, or system stream.
- `n` returns up to 100 items.
- `r=o` returns oldest first.
- `c` is a continuation token.
- Items include `id`, `timestampUsec`, `published`, `updated`,
  `canonical.href`, `alternate.href`, `summary.content`, `author`, and origin
  metadata.

Limitation:

- The `ot` start timestamp returns only articles newer than the timestamp, and
  if `r=o` is set and the time is more than one month in the past, the request
  defaults to one month ago.

Pros:

- Familiar Google Reader-style shapes.
- Good for recent sync or user-owned reading history.

Cons:

- The documented one-month floor makes it weak for arbitrary historical
  playback import.
- Requires user authentication.

Implementation notes:

- Do not treat Inoreader as a primary archive source.
- It may still be useful for a user's existing account if their unread/starred
  state points to old items, but that is not a complete feed archive.

### 8. Common Crawl

Common Crawl can be a secondary web-archive fallback.

Sources:

- [Common Crawl CDXJ Index](https://commoncrawl.org/cdxj-index)
- [Common Crawl Index Server](https://index.commoncrawl.org/)

Findings:

- Common Crawl exposes CDXJ indexes per crawl, not one universal all-time index.
- Records include `urlkey`, `timestamp`, `url`, `mime`, `status`, `digest`,
  `length`, `offset`, and `filename`.
- Fetching a record requires an HTTP range request against the WARC file using
  `filename`, `offset`, and `length`.

Pros:

- Public and free.
- Can recover captures unavailable from Wayback.

Cons:

- Coverage of RSS feeds is likely spottier than Wayback.
- Implementation is more complex because it requires iterating many crawl
  indexes and reading WARC records.
- Not optimized for exact feed archive reconstruction.

Implementation notes:

- Consider only after Wayback and publisher archives.
- Use `cdx_toolkit` or direct CDXJ queries for targeted feed URLs.
- Store Common Crawl captures with lower source priority than publisher or
  Wayback records unless they contain unique items.

### 9. Memento TimeMaps

[RFC 7089: Memento](https://www.rfc-editor.org/rfc/rfc7089.html) defines HTTP
datetime negotiation and TimeMaps, which list archived versions of a resource.

Pros:

- Standard way to discover archived states across Memento-aware archives.
- Can generalize beyond Internet Archive.

Cons:

- Support is uneven.
- For Wayback itself, CDX is usually more direct and richer for this use case.

Implementation notes:

- Memento can be a discovery adapter for archives that expose TimeMaps.
- Do not prioritize it over direct Wayback CDX for the initial build.

### 10. Sitemaps and CMS APIs

Sitemaps and CMS APIs reconstruct a site archive, not necessarily exact feed
membership, but they are useful fallbacks when the feed maps closely to the
site's posts.

Sources:

- [Sitemaps protocol](https://www.sitemaps.org/protocol.html)
- [WordPress REST API pagination](https://developer.wordpress.org/rest-api/using-the-rest-api/pagination/)
- [WordPress REST posts reference](https://developer.wordpress.org/rest-api/reference/posts/)

Findings:

- Sitemaps list URLs and optional `lastmod`. Sitemap indexes can point to many
  sitemap files.
- Sitemaps may include Atom or RSS files, but the protocol notes that feeds may
  only include recent URLs.
- WordPress REST exposes `/wp/v2/posts`, paged with `page` and `per_page` up to
  100. Responses include post dates, links, GUIDs, titles, excerpts, content,
  and modified dates depending on context.

Pros:

- High coverage for WordPress and other CMS-backed blogs.
- Can recover old posts when RSS history is short.

Cons:

- Not the same as "items that appeared in this feed".
- Needs article extraction and feed-membership heuristics.
- Dates from sitemaps may be modification dates, not publication dates.

Implementation notes:

- Use only when feed domain and site archive are clearly related.
- Mark items as "site archive fallback" rather than feed-observed.
- Try to map posts back to feed identity by URL, canonical link, and metadata.

### 11. Podcast-specific indexes

For podcast feeds, specialized podcast indexes can be much better than generic
RSS readers.

Source:

- [PodcastIndex.org OpenAPI spec](https://podcastindex-org.github.io/docs-api/pi_api.json)

Relevant API capabilities:

- `/episodes/byfeedurl` returns all episodes known for a feed URL in reverse
  chronological order.
- `/episodes/byfeedid`, `/episodes/bypodcastguid`, and `/episodes/byitunesid`
  provide alternate lookups.
- Authentication headers are required for most API endpoints.

Pros:

- Podcast feeds often need complete episode playback.
- Podcast Index has a large podcast-specific corpus.
- Episode metadata is often more structured than blog RSS items.

Cons:

- Only applies to podcast-style feeds.
- It is an index corpus, not proof of what every historical feed snapshot
  contained.

Implementation notes:

- Detect podcast feeds by RSS namespace elements, enclosure types, and channel
  metadata.
- Use Podcast Index as a high-value optional source for podcast feeds.

### 12. Other hosted readers

These services are useful for user sync, but not good general historical
archives based on current documented limits.

Feedbin:

- [Feedbin storage limits](https://feedbin.com/help/storage-limits/) says
  Feedbin is not an archival tool and stores 400 of the most recent articles per
  feed.
- Not suitable as a complete archive source.

BazQux Reader:

- [BazQux FAQ](https://bazqux.com/faq) says unread articles are kept forever,
  but there is a limit of 500 total read and unread articles per feed.
- [BazQux API docs](https://github.com/bazqux/bazqux-api) also describe old
  items being removed from feeds to keep the last 500 items.
- Not suitable as a complete archive source.

The Old Reader, FreshRSS, Tiny Tiny RSS, Miniflux, and similar readers:

- They can be useful if the user already has a long-lived instance with retained
  articles.
- They should not be treated as external corpus providers.
- Tiny Tiny RSS explicitly has purging behavior tied to feed updates; see the
  [Tiny Tiny RSS FAQ](https://tt-rss.org/docs/FAQ.html).

## Non-feed news/archive corpora

Media/news archives can supplement specific news sites but should not be primary
feed playback sources.

Examples:

- Media Cloud
- GDELT
- Event Registry

Pros:

- Useful for public news sources.
- May have article metadata and dates even when feeds are gone.

Cons:

- Coverage is source-specific and usually starts when that system began
  collecting the source.
- They track articles, not RSS feed membership.
- Licensing/API limits can be more complicated.

Implementation notes:

- Use only as site-specific fallback for news domains.
- Store provenance distinctly from feed-derived items.

## Data model implications

The importer should materialize a local archive per source feed.

Suggested item fields:

- `archiveItemId`: local stable ID.
- `feedUrl`: canonical feed URL being played back.
- `sourceUrls`: all source feed/snapshot URLs where this item was observed.
- `sourceType`: current feed, RFC5005 archive, publisher pagination, Wayback,
  NewsBlur, Feedly, Inoreader, Common Crawl, sitemap, CMS API, Podcast Index,
  manual import, etc.
- `sourceConfidence`: high, medium, low.
- `firstObservedAt`: earliest fetch/snapshot/import time.
- `lastObservedAt`: latest fetch/snapshot/import time.
- `publishedAt`: publisher-supplied item date.
- `updatedAt`: publisher-supplied updated date.
- `playbackDate`: date used for sorting, usually `publishedAt` with fallback to
  `firstObservedAt`.
- `guid`: RSS GUID or Atom ID.
- `canonicalUrl`: canonical item URL.
- `titleHtml` or `titleText`.
- `contentHtml`: item HTML content or summary.
- `authors`.
- `attachments`: enclosures/media.
- `rawSourceRefs`: compact references to raw payloads in R2/KV/D1.
- `dedupeKey`: normalized identity key.

Suggested feed archive fields:

- `feedUrl`
- `feedTitle`
- `sourceSummary`: counts per source type.
- `oldestItemAt`
- `newestItemAt`
- `itemCount`
- `knownGaps`: date ranges where source snapshots/pagination indicate missing
  coverage.
- `lastImportedAt`
- `importVersion`

## Dedupe strategy

Dedupe should be conservative and explainable:

1. Exact Atom `id` or RSS `guid` with `isPermaLink=false`.
2. Canonical URL after normalization.
3. Enclosure URL for podcast episodes.
4. Title plus published date within a tolerance window.
5. Content digest as a supporting signal, not a primary identity.

When duplicates conflict:

- Prefer publisher archive/current-feed data over reader data.
- Prefer reader data over generic web archive data if reader data has richer
  item content.
- Prefer item-level published/updated dates over snapshot/import dates.
- Keep raw observations so merges can be audited later.

## Completeness scoring

Avoid a boolean "complete" unless the source is explicitly complete.

Suggested labels:

- `complete`: Current feed has `fh:complete`, or RFC 5005 archived feed chain
  was fully traversed without missing archives.
- `publisher-archive`: Publisher pagination or CMS API produced a plausible
  full archive, but not standardized.
- `stitched`: Wayback/Common Crawl snapshots were stitched and may have gaps.
- `reader-archive`: Imported from a reader account/corpus with its own retention
  semantics.
- `partial`: Current feed or capped reader API only.
- `unknown`: Not enough evidence.

Display item count and oldest item date alongside the label.

## Initial implementation recommendation

Build the first version around these importers:

1. `CurrentFeedImporter`
2. `Rfc5005Importer`
3. `WaybackCdxImporter`
4. `WordPressRestImporter` as a fallback when detected

Then add optional authenticated connectors:

1. `NewsBlurImporter`
2. `FeedlyImporter` after proving historical API access
3. `PodcastIndexImporter` for podcast feeds

Do not start with Inoreader, Feedbin, or BazQux as archive sources. Their APIs
are useful for feed-reader sync, but current documented retention or paging
behavior does not make them good replacements for Google Reader's historical
feed corpus.

## Open questions to test with real feeds

- How often does Wayback capture RSS/Atom feed URLs with usable raw XML?
- Does `collapse=digest` miss non-adjacent duplicate feed captures enough that a
  second in-process digest set is required? Expected answer: yes, keep a local
  digest set.
- Which archived URL form gives the most reliable raw feed payload from
  Wayback for XML feeds?
- Can NewsBlur Premium Archive API pagination retrieve all backfilled stories
  for a subscribed feed, not just recent or unread stories?
- Can Feedly `/v3/streams/contents` continuation walk all the way into the
  indefinite article history described by the UI help page?
- Which WordPress feeds support `?paged=N` or `?page=N` directly, and how often
  do they repeat the first page?
- Should imported raw snapshots live in R2, with normalized item indexes in D1
  or KV?
