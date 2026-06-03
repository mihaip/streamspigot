# Feed Playback Alternatives

Research date: 2026-06-03

## Goal

Find existing tools or sites that do something like the legacy Stream Spigot
Feed Playback tool: take an existing feed or archive and publish a new feed URL
that releases older items gradually, usually daily, weekly, or every few days.

The closest current products fall into three groups:

1. Generic RSS/blog replay tools.
2. Podcast-specific catch-up or drip-feed tools.
3. Archive reconstruction tools that expose older feed items but do not
   schedule playback by themselves.

## Summary

There are a few real tools in this space, but it is still a thin niche.

- [ReFeed](https://refeed.to/about) is the closest direct generic alternative.
  It replays blogs and RSS feeds from the beginning, daily or weekly.
- [Sponder](https://sponder.app/) appears to be a broader commercial
  feed-transformation service with archive replay, time shift, rate limiting,
  filtering, merging, and podcast support.
- [Recast](https://recastthis.com/) is the closest mature podcast-specific
  equivalent. It creates a personalized feed that releases old podcast episodes
  every few days until the listener catches up.
- [Episode Drip](https://episode-drip.net/) is another podcast-specific
  time-release feed generator with explicit episode selection and schedule
  controls.
- [Backfeed](https://backfeed.app/) is not a playback scheduler, but it is a
  relevant data-source precedent: it rebuilds a larger historical RSS/podcast
  feed from Internet Archive Wayback snapshots.

Older historical tools existed, including RSS Replay and Stream Spigot's own
Feed Playback, but they appear to be dead or retired.

## Direct Generic Feed Playback

### ReFeed

Source:

- [ReFeed](https://refeed.to/)
- [ReFeed About](https://refeed.to/about)
- [Show HN: Refeed.to](https://news.ycombinator.com/item?id=40739039)

What it does:

- Takes a website URL.
- Creates a new Atom feed.
- Adds posts from the original site in order from the beginning.
- Lets the user choose daily or weekly cadence.

Limitations and notes:

- The about page says podcasts are not yet supported.
- The public site is minimal: URL input plus daily/weekly options.
- I did not find public source code during this pass.
- It is the cleanest product reference for resurrecting generic feed playback.

Relevance:

- Very high. This is essentially the same user-facing concept as the legacy
  Stream Spigot Feed Playback tool, minus podcast support.

### Sponder

Source:

- [Sponder](https://sponder.app/)

What it does:

- Reads RSS feeds, podcast feeds, or webpages.
- Applies transformation rules.
- Publishes a new feed URL for use in an existing reader or podcast app.
- Advertises archive replay, time shift, rate limit, feed merging, keyword
  filtering, podcast rerun detection, and webpage-to-RSS history.

Relevant claims from the site:

- "Build a feed from an archive or webpage and drip it into your reader at your
  own pace."
- Archive Replay, Time Shift, and Rate Limit are presented as first-class
  flows.
- It claims that once the replay catches up to the live feed, the generated feed
  can transition to the live feed.

Limitations and notes:

- Commercial product with sign-up.
- The page is marketing-heavy, so implementation details and archive-source
  behavior are unclear.
- Needs hands-on testing to know whether "archive" means current-site archive,
  Wayback, its own crawler history, reader-backed history, or user-provided
  webpages.

Relevance:

- High. It may already cover much of the product surface being considered:
  replay, delay, rate limiting, feed composition, and podcast/webpage support.

## Podcast-Specific Playback

### Recast

Source:

- [Recast](https://recastthis.com/)
- [Recast Help](https://recastthis.com/help/)
- [xurble/recast on GitHub](https://github.com/xurble/recast)

What it does:

- Creates a personalized podcast RSS feed.
- User provides a podcast website or feed URL.
- Recast returns a unique feed URL to subscribe to in a podcast app.
- By default, it releases one old episode every five days.
- Users can change the frequency or manually release the next episode.
- No account is required; generated links are unique and hard to guess.

Archive behavior:

- Recast can only send episodes that are in the feed today, unless Recast has
  previously seen older episodes that later dropped off the original feed.
- This means popular podcasts may have better historical coverage than a newly
  encountered podcast because another user may already have caused Recast to
  cache older episodes.

Implementation notes from the GitHub repo:

- Django application.
- Needs periodic `manage.py refreshfeeds`.
- Has optional Cloudflare-related support for caching and fetching protected
  feeds.
- MIT licensed.

Limitations and notes:

- Podcast-only.
- Depends primarily on the current feed plus Recast's own accumulated crawl
  history.
- Does not solve arbitrary blog/feed archive reconstruction.

Relevance:

- Very high for podcast playback UX and feed-generation behavior.
- Useful implementation precedent because it is open source.

### Episode Drip

Source:

- [Episode Drip](https://episode-drip.net/)

What it does:

- Creates time-released podcast feeds.
- User enters a podcast RSS feed URL.
- User selects episodes.
- User configures start date, drop time, timezone, days of week, and episode
  order.
- Produces a new feed URL for a podcast app.

Limitations and notes:

- Podcast-specific.
- Appears to work from the current podcast RSS feed and selected episodes.
- I did not find source code or documentation about persistence, archive
  coverage, or generated-feed lifetime during this pass.

Relevance:

- High for scheduling UX.
- Less relevant for historical archive reconstruction.

## Archive Expansion, Not Playback

### Backfeed

Source:

- [Backfeed](https://backfeed.app/)
- [Backfeed API Usage](https://backfeed.app/api-docs.php)

What it does:

- Takes an RSS or podcast feed.
- Looks up historical feed snapshots in the Internet Archive Wayback Machine.
- Concatenates the live feed with deduplicated historical items from those
  snapshots.
- Produces a larger feed URL.

Useful behavior:

- Works with XML-formatted RSS feeds for both articles and podcasts.
- Can load up to 5000 unique Wayback snapshots by default.
- Has options for maximum snapshot count, enclosure checking, and a pagination
  URL parameter such as WordPress `paged`.
- Verifies links/enclosures by default.
- Caches snapshots and link checks.
- Has a simple URL-shaped API: `https://backfeed.app/KEY/URL`.

Limitations and notes:

- Requires an access key.
- It does not drip items over time; it exposes a larger archive feed.
- Completeness depends on archive.org snapshot coverage.
- It can miss episodes/articles when Wayback missed a period, when robots rules
  blocked archiving, when item links/enclosures are broken, or when a feed has a
  huge high-frequency history.
- Large feeds may take a long time to process and may be too large for some
  readers.

Relevance:

- High as a data-source precedent.
- A resurrected Feed Playback tool could use a Backfeed-like importer, then add
  Stream Spigot-owned scheduling and output feeds on top.

### ArchiveBox and web-archive replay tools

Source:

- [ArchiveBox](https://github.com/ArchiveBox/ArchiveBox)
- [pywb](https://pypi.org/project/pywb/)

What they do:

- ArchiveBox can ingest RSS feeds, bookmarks, browser history, and URL lists,
  then save pages in multiple formats.
- pywb replays WARC/ARC web archives.

Limitations and notes:

- These are web-archiving tools, not feed playback services.
- They are useful if Stream Spigot wants to maintain its own content archive,
  but they do not directly provide a new drip-feed URL.

Relevance:

- Medium. Useful for implementation and storage ideas, not a direct alternative.

## Historical or Dead Tools

### RSS Replay

Source:

- [RSS4Lib note about RSS Replay](https://www.rss4lib.com/2010/04/)
- Historical URL from that note: `rssreplay.heroku.com`

What it did:

- Took an RSS feed and replayed its backfile at a chosen frequency.
- Supported daily/every-few-days style delivery.
- Had a PageRank filter for old posts.

Current status:

- The old Heroku URL appears dead.

Relevance:

- Historical precedent only.

### Stream Spigot Feed Playback

Source:

- [Feed Playback and Stream Spigot](https://blog.persistent.info/2011/02/feed-playback-and-stream-spigot.html)
- `legacy/app/feedplayback/`
- `legacy/app/datasources/googlereader.py`

What it did:

- Accepted a blog or feed URL.
- Used Google Reader's historical feed corpus to find old items.
- Created a Google Reader public tag feed.
- Advanced playback by tagging one more original item each day, every other
  day, or weekly.

Current status:

- Retired. The handlers return HTTP 410 in the legacy code.
- Google Reader no longer exists.

Relevance:

- Product and behavior baseline for the new implementation.

## Adjacent Drip or Syndication Tools

### dlvr.it

Source:

- [Super User answer mentioning dlvr.it trickle behavior](https://superuser.com/questions/414085/how-can-i-set-up-an-rss-feed-to-drip-feed-one-new-post-per-day-from-an-existing)

What it does:

- The historical answer says dlvr.it could "trickle" RSS items into posting
  windows and choose most recent, oldest, or random posts.

Limitations and notes:

- This is social/content syndication behavior, not clearly a new RSS playback
  feed.
- Needs current product verification before relying on it as an alternative.

Relevance:

- Low to medium. Useful as an adjacent scheduling concept, not a feed-reader
  playback replacement.

### Private podcast platforms and course drip feeds

Source:

- [Hello Audio on private podcast feeds](https://helloaudio.fm/private-podcasts-vs-membership-sites/)
- [Hello Audio on gated premium audio](https://helloaudio.fm/ways-to-gate-premium-audio-content/)

What they do:

- Private-podcast and membership platforms often support drip release,
  time-based access, or sequential delivery for owned content.

Limitations and notes:

- Usually intended for creators publishing their own premium/course audio.
- Not designed to take an arbitrary public RSS feed and replay it from the
  beginning for an individual listener.

Relevance:

- Medium for podcast UX and private-feed access patterns.
- Low for generic historical RSS archive discovery.

## Comparison Table

| Tool | Generic RSS/blogs | Podcasts | Drip playback | Archive reconstruction | Open source |
| --- | --- | --- | --- | --- | --- |
| ReFeed | Yes | No, planned | Daily/weekly | Unclear | Not found |
| Sponder | Yes | Yes | Yes | Claimed, details unclear | Not found |
| Recast | No | Yes | Every few days/manual | Current feed plus seen-history cache | Yes |
| Episode Drip | No | Yes | Explicit schedule controls | Current feed/selected episodes | Not found |
| Backfeed | Yes | Yes | No | Wayback snapshots | Not found |
| RSS Replay | Yes | Unknown | Yes | Unknown | Dead |
| ArchiveBox | Indirect | Indirect | No | Local archiving | Yes |

## Takeaways For Stream Spigot

- There is enough prior art to validate the product concept.
- ReFeed is the closest generic product reference.
- Recast is the strongest open-source reference for personalized generated
  feeds and podcast catch-up behavior.
- Backfeed is the most relevant precedent for filling gaps in current feeds via
  Wayback snapshots.
- Sponder is worth testing before implementation, because it may already cover
  generic replay, podcast replay, time shifting, and rate limiting in one
  service.
- None of the discovered alternatives clearly combines all desired behavior:
  arbitrary feed archive reconstruction, transparent provenance/gap reporting,
  locally owned storage, and per-user playback feeds.

## Implementation Implications

For a resurrected Stream Spigot tool, the strongest design would combine:

1. A Backfeed-like archive importer using current feed contents, publisher
   archive links, pagination heuristics, and Wayback snapshots.
2. Recast-like personalized output feeds with hard-to-guess URLs and simple
   catch-up controls.
3. ReFeed-like generic UX: paste URL, choose daily/weekly cadence, subscribe to
   the generated feed.
4. Optional podcast-specific controls from Episode Drip: explicit episode
   selection, start date, release time, timezone, days of week, and oldest/newest
   ordering.
5. Provenance and gap reporting so the tool can say when an archive is
   incomplete instead of implying Google Reader-level coverage.
