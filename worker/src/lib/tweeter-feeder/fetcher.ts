import type {CachedValue, TweeterFeederKV} from "./kv";
import type {
    TweeterFeederSession,
    TwitterCard,
    TwitterEntities,
    TwitterFetchError,
    TwitterMedia,
    TwitterPoll,
    TwitterTimelineResult,
    TwitterTweet,
    TwitterUser,
    TwitterUrlEntity,
} from "./types";

const USER_BY_SCREEN_NAME_QUERY =
    "WEoGnYB0EG1yGwamDCF6zg/UserResultByScreenNameQuery";
const USER_TWEETS_QUERY = "lrMzG9qPQHpqJdP3AbM-bQ/UserTweets";

const X_API_ORIGIN = "https://twitter.com";
const X_API_BASE_URL = "https://mobile.twitter.com/i/api/graphql";
const TWITTER_BASE_URL = "https://twitter.com";
const USER_CACHE_TTL_SECONDS = 24 * 60 * 60;
const TIMELINE_FRESH_SECONDS = 10 * 60;
const TIMELINE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const SESSION_COOLDOWN_SECONDS = 15 * 60;
const GRAPHQL_TIMEOUT_MS = 15_000;
const CACHE_SCHEMA_VERSION = 2;

// Public web bearer token used by x.com browser GraphQL requests.
const X_BEARER_TOKEN =
    "Bearer AAAAAAAAAAAAAAAAAAAAAFXzAwAAAAAAMHCxpeSDG1gLNLghVe8d74hl6k4%3DRUMF4xAQLsbeBhTSRrCiQpJtxoGWeyHrDb5te2jpGskWDFW82F";

const GRAPHQL_FEATURES = {
    articles_preview_enabled: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    communities_web_enable_tweet_community_results_fetch: true,
    content_disclosure_ai_generated_indicator_enabled: true,
    content_disclosure_indicator_enabled: true,
    creator_subscriptions_tweet_preview_api_enabled: true,
    freedom_of_speech_not_reach_fetch_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    longform_notetweets_consumption_enabled: true,
    longform_notetweets_inline_media_enabled: false,
    longform_notetweets_rich_text_read_enabled: true,
    post_ctas_fetch_enabled: true,
    premium_content_api_read_enabled: false,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    responsive_web_enhance_cards_enabled: false,
    responsive_web_graphql_exclude_directive_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_grok_analysis_button_from_backend: true,
    responsive_web_grok_analyze_button_fetch_trends_enabled: false,
    responsive_web_grok_analyze_post_followups_enabled: true,
    responsive_web_grok_annotations_enabled: true,
    responsive_web_grok_community_note_auto_translation_is_enabled: true,
    responsive_web_grok_image_annotation_enabled: true,
    responsive_web_grok_imagine_annotation_enabled: true,
    responsive_web_grok_share_attachment_enabled: true,
    responsive_web_grok_show_grok_translated_post: true,
    responsive_web_jetfuel_frame: true,
    responsive_web_profile_redirect_enabled: false,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    rweb_cashtags_composer_attachment_enabled: true,
    rweb_cashtags_enabled: true,
    rweb_tipjar_consumption_enabled: false,
    rweb_video_screen_enabled: false,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    tweetypie_unmention_optimization_enabled: false,
    verified_phone_label_enabled: false,
    view_counts_everywhere_api_enabled: true,
};

const GRAPHQL_FIELD_TOGGLES = {
    withArticlePlainText: false,
};

export class TwitterFetcher {
    #kv: TweeterFeederKV;
    #sessions: TweeterFeederSession[];

    constructor(kv: TweeterFeederKV, sessions: TweeterFeederSession[]) {
        this.#kv = kv;
        this.#sessions = sessions;
    }

    async fetchUserForSession(
        session: TweeterFeederSession
    ): Promise<TwitterUser> {
        if (!session.username) {
            throw new TwitterGraphQLFetchError(
                "Session is missing a username"
            );
        }

        const user = await this.#fetchGraphQL(
            session,
            USER_BY_SCREEN_NAME_QUERY,
            {
                screen_name: session.username,
            }
        ).then(parseGraphUser);
        if (!user?.id) {
            throw new TwitterGraphQLFetchError(
                `Could not find @${session.username}`
            );
        }
        return user;
    }

    async fetchTimeline(
        username: string,
        count: number
    ): Promise<TwitterTimelineResult> {
        const normalizedUsername = normalizeUsername(username);
        const cacheKey = `v${CACHE_SCHEMA_VERSION}:timeline:${normalizedUsername}:${count}`;
        const cached =
            await this.#kv.getCachedJSON<TwitterTimelineResult>(cacheKey);
        if (cached && cacheAgeSeconds(cached) < TIMELINE_FRESH_SECONDS) {
            return cached.value;
        }

        try {
            const user = await this.#fetchUser(normalizedUsername);
            const tweets = await this.#fetchTimelineFromX(user, count);
            const result: TwitterTimelineResult = {
                username: normalizedUsername,
                tweets,
                fromStaleCache: false,
            };
            await this.#kv.putCachedJSON(
                cacheKey,
                result,
                TIMELINE_CACHE_TTL_SECONDS
            );
            return result;
        } catch (e) {
            if (cached) {
                console.warn("Using stale Tweeter Feeder timeline cache", {
                    username: normalizedUsername,
                    ageSeconds: cacheAgeSeconds(cached),
                    tweetCount: cached.value.tweets.length,
                    error: e,
                });
                return {...cached.value, fromStaleCache: true};
            }
            console.error("Tweeter Feeder timeline fetch failed without cache", {
                username: normalizedUsername,
                error: e,
            });
            throw e;
        }
    }

    async #fetchUser(username: string): Promise<TwitterUser> {
        const cacheKey = `v${CACHE_SCHEMA_VERSION}:user:${username}`;
        const cached = await this.#kv.getCachedJSON<TwitterUser>(cacheKey);
        if (cached) {
            return cached.value;
        }

        const user = await this.#fetchWithSessions(username, session =>
            this.#fetchGraphQL(session, USER_BY_SCREEN_NAME_QUERY, {
                screen_name: username,
            })
        ).then(parseGraphUser);

        if (!user?.id) {
            throw new TwitterGraphQLFetchError(`Could not find @${username}`);
        }
        if (user.protected) {
            throw new TwitterGraphQLFetchError(`@${username} is protected`);
        }
        if (user.suspended) {
            throw new TwitterGraphQLFetchError(`@${username} is suspended`);
        }

        await this.#kv.putCachedJSON(cacheKey, user, USER_CACHE_TTL_SECONDS);
        return user;
    }

    async #fetchTimelineFromX(
        user: TwitterUser,
        count: number
    ): Promise<TwitterTweet[]> {
        const json = await this.#fetchWithSessions(user.username, session =>
            this.#fetchGraphQL(session, USER_TWEETS_QUERY, {
                userId: user.id,
                count,
                includePromotedContent: true,
                withQuickPromoteEligibilityTweetFields: true,
                withVoice: true,
            })
        );
        const tweets = parseGraphTimeline(json);
        return tweets;
    }

    async #fetchWithSessions<T>(
        key: string,
        fetchSession: (session: TweeterFeederSession) => Promise<T>
    ): Promise<T> {
        if (this.#sessions.length === 0) {
            console.error("No Tweeter Feeder sessions are configured");
            throw new TwitterGraphQLFetchError(
                "No Tweeter Feeder sessions are configured"
            );
        }

        const orderedSessions = orderedSessionsForKey(this.#sessions, key);
        const availableSessions = [];
        for (const session of orderedSessions) {
            const id = sessionCooldownId(session);
            if (!(await this.#kv.getCooldown(`session:${id}`))) {
                availableSessions.push(session);
            }
        }

        const sessionsToTry =
            availableSessions.length > 0 ? availableSessions : orderedSessions;
        let lastError: unknown;
        for (const session of sessionsToTry) {
            try {
                return await fetchSession(session);
            } catch (e) {
                lastError = e;
                console.warn("Tweeter Feeder session attempt failed", {
                    key,
                    session: sessionLabel(session),
                    cooldownSession:
                        e instanceof TwitterGraphQLFetchError
                            ? e.cooldownSession
                            : false,
                    error: e,
                });
                if (
                    e instanceof TwitterGraphQLFetchError &&
                    e.cooldownSession
                ) {
                    const id = sessionCooldownId(session);
                    await this.#kv.putCooldown(
                        `session:${id}`,
                        SESSION_COOLDOWN_SECONDS
                    );
                }
            }
        }

        if (lastError instanceof Error) {
            console.error("All Tweeter Feeder session attempts failed", {
                key,
                error: lastError,
            });
            throw lastError;
        }
        console.error("All Tweeter Feeder session attempts failed", {
            key,
            error: lastError,
        });
        throw new TwitterGraphQLFetchError("Twitter/X fetch failed");
    }

    async #fetchGraphQL(
        session: TweeterFeederSession,
        endpoint: string,
        variables: Record<string, unknown>
    ): Promise<unknown> {
        const url = new URL(`${X_API_BASE_URL}/${endpoint}`);
        url.searchParams.set("variables", JSON.stringify(variables));
        url.searchParams.set("features", JSON.stringify(GRAPHQL_FEATURES));
        url.searchParams.set(
            "fieldToggles",
            JSON.stringify(GRAPHQL_FIELD_TOGGLES)
        );

        const startTime = Date.now();
        const abortController = new AbortController();
        const timeout = setTimeout(
            () => abortController.abort(),
            GRAPHQL_TIMEOUT_MS
        );
        let response: Response;
        try {
            const headers: Record<string, string> = {
                "accept": "*/*",
                "accept-language": "en-US,en;q=0.9",
                "authorization": X_BEARER_TOKEN,
                "content-type": "application/json",
                "cookie": twitterCookieHeader(session),
                "origin": X_API_ORIGIN,
                "referer": `${X_API_ORIGIN}/${getString(variables.screen_name) ?? ""}`,
                "user-agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
                "x-csrf-token": session.ct0,
                "x-twitter-active-user": "yes",
                "x-twitter-auth-type": "OAuth2Session",
                "x-twitter-client-language": "en",
            };
            response = await fetch(url, {
                signal: abortController.signal,
                headers,
            });
        } catch (e) {
            const elapsedMs = Date.now() - startTime;
            console.error("Tweeter Feeder GraphQL request failed", {
                endpoint,
                elapsedMs,
                timedOut: abortController.signal.aborted,
                error: e,
            });
            throw new TwitterGraphQLFetchError(
                abortController.signal.aborted
                    ? `Twitter/X request timed out after ${GRAPHQL_TIMEOUT_MS}ms`
                    : `Twitter/X request failed: ${errorToMessage(e)}`,
                abortController.signal.aborted
            );
        } finally {
            clearTimeout(timeout);
        }

        const body = await response.text();
        const elapsedMs = Date.now() - startTime;
        if (!response.ok) {
            console.warn("Tweeter Feeder GraphQL returned HTTP error", {
                endpoint,
                status: response.status,
                elapsedMs,
                bodyPrefix: body.slice(0, 240),
            });
            throw new TwitterGraphQLFetchError(
                `Twitter/X returned HTTP ${response.status}`,
                response.status === 401 ||
                    response.status === 403 ||
                    response.status === 429
            );
        }

        let json: unknown;
        try {
            json = JSON.parse(body);
        } catch {
            throw new TwitterGraphQLFetchError(
                "Twitter/X returned invalid JSON"
            );
        }

        const errors = getArray(getObject(json)?.errors);
        if (errors.length > 0) {
            console.warn("Tweeter Feeder GraphQL response contained errors", {
                endpoint,
                errors: summarizeTwitterErrors(errors),
            });
            throw new TwitterGraphQLFetchError(
                twitterErrorMessage(errors) ?? "Twitter/X returned an error",
                twitterErrorsNeedCooldown(errors)
            );
        }
        return json;
    }
}

export function parseSessions(value: unknown): TweeterFeederSession[] {
    const sessions = getArray(value);
    if (!Array.isArray(value)) {
        throw new Error(
            'Tweeter Feeder sessions must be stored as a JSON array at KV key "tweeter-feeder:sessions"'
        );
    }
    return sessions.map((session, i) => parseSession(session, i + 1));
}

export function normalizeUsername(username: string): string {
    return username.trim().replace(/^@/, "").toLowerCase();
}

export function parseUsernames(value: string | null): string[] {
    if (!value) {
        return [];
    }
    const usernames = value
        .split(/[\s,+]+/)
        .map(normalizeUsername)
        .filter(Boolean);
    const dedupedUsernames: string[] = [];
    const seenUsernames = new Set<string>();
    for (const username of usernames) {
        if (!seenUsernames.has(username)) {
            seenUsernames.add(username);
            dedupedUsernames.push(username);
        }
    }
    return dedupedUsernames;
}

export function isValidTwitterUsername(username: string): boolean {
    return /^[a-zA-Z0-9_]{1,15}$/.test(username);
}

function orderedSessionsForKey(
    sessions: TweeterFeederSession[],
    key: string
): TweeterFeederSession[] {
    if (sessions.length <= 1) {
        return sessions;
    }
    const startIndex = stableHash(key) % sessions.length;
    return sessions.map((_, i) => sessions[(startIndex + i) % sessions.length]);
}

export function fetchErrorForUsername(
    username: string,
    error: unknown
): TwitterFetchError {
    return {
        username,
        message: errorToMessage(error),
    };
}

export function errorToMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

class TwitterGraphQLFetchError extends Error {
    cooldownSession: boolean;

    constructor(message: string, cooldownSession: boolean = false) {
        super(message);
        this.name = "TwitterGraphQLFetchError";
        this.cooldownSession = cooldownSession;
    }
}

function parseSession(
    value: unknown,
    lineNumber: number
): TweeterFeederSession {
    const session = getObject(value);
    if (!session || session.kind !== "cookie") {
        throw new Error(`Session ${lineNumber} must have kind "cookie"`);
    }
    const authToken = getString(session.auth_token);
    const ct0 = getString(session.ct0);
    if (!authToken || !ct0) {
        throw new Error(
            `Session ${lineNumber} must include auth_token and ct0`
        );
    }
    const username = getString(session.username);
    const id = getString(session.id);
    return {
        kind: "cookie",
        authToken,
        ct0,
        ...(username ? {username} : {}),
        ...(id ? {id} : {}),
    };
}

function twitterCookieHeader(session: TweeterFeederSession): string {
    return `auth_token=${session.authToken}; ct0=${session.ct0}`;
}

function parseGraphUser(json: unknown): TwitterUser | null {
    const root = getObject(json);
    const userResult =
        getObjectAt(root, ["data", "user", "result"]) ??
        getObjectAt(root, ["data", "user_result", "result"]) ??
        getObjectAt(root, ["data", "user_result_by_screen_name", "result"]) ??
        getObjectAt(root, ["user_result", "result"]);
    return userResult ? parseUserResult(userResult) : null;
}

function parseGraphTimeline(json: unknown): TwitterTweet[] {
    const tweets: TwitterTweet[] = [];
    const seenTweetIds = new Set<string>();
    for (const entry of findTimelineEntries(json)) {
        for (const itemContent of findTimelineItemContents(entry)) {
            const result = getObjectAt(itemContent, [
                "tweet_results",
                "result",
            ]);
            const tweet = result ? parseTweetResult(result) : null;
            if (tweet && !seenTweetIds.has(tweet.id)) {
                seenTweetIds.add(tweet.id);
                tweets.push(tweet);
            }
        }
    }
    return tweets;
}

function parseUserResult(result: JsonObject): TwitterUser | null {
    const legacy =
        getObject(result.legacy) ??
        getObject(result.core) ??
        getObject(result.user) ??
        result;
    const username =
        getString(legacy.screen_name) ??
        getString(getObject(result.core)?.screen_name) ??
        getString(getObject(result.legacy)?.screen_name);
    const displayName =
        getString(legacy.name) ??
        getString(getObject(result.core)?.name) ??
        username;
    const avatarUrl =
        getString(legacy.profile_image_url_https) ??
        getString(getValueAt(result, ["avatar", "image_url"])) ??
        getString(getValueAt(result, ["core", "avatar", "image_url"])) ??
        "";
    const id =
        getString(result.rest_id) ??
        getString(legacy.id_str) ??
        getString(getObject(result.core)?.user_id);

    if (!username || !id) {
        return null;
    }

    return {
        id,
        username,
        displayName: displayName ?? username,
        avatarUrl: avatarUrl.replace("_normal", ""),
        url: `${TWITTER_BASE_URL}/${username}`,
        protected:
            getBoolean(legacy.protected) ??
            getBoolean(getObject(result.privacy)?.protected),
        suspended: getString(result.unavailable_reason) === "Suspended",
    };
}

function parseTweetResult(
    result: JsonObject,
    seenTweetIds: Set<string> = new Set()
): TwitterTweet | null {
    const tweetResult = getObject(result.tweet) ?? result;
    const legacy = getObject(tweetResult.legacy);
    if (!legacy) {
        return null;
    }

    const id = getString(tweetResult.rest_id) ?? getString(legacy.id_str);
    if (!id || seenTweetIds.has(id)) {
        return null;
    }
    seenTweetIds.add(id);

    const userResult =
        getObjectAt(tweetResult, ["core", "user_results", "result"]) ??
        getObjectAt(tweetResult, ["core", "user_result", "result"]) ??
        getObjectAt(tweetResult, ["user_results", "result"]);
    const author = userResult ? parseUserResult(userResult) : null;
    if (!author) {
        return null;
    }

    const note = getObjectAt(tweetResult, [
        "note_tweet",
        "note_tweet_results",
        "result",
    ]);
    const text = getString(note?.text) ?? getString(legacy.full_text) ?? "";
    const noteEntities = getObject(note?.entity_set);
    const legacyEntities = getObject(legacy.entities);

    const retweetResult =
        getObjectAt(tweetResult, [
            "legacy",
            "retweeted_status_result",
            "result",
        ]) ??
        getObjectAt(tweetResult, ["retweeted_status_result", "result"]) ??
        getObjectAt(tweetResult, ["repostedStatusResults", "result"]);
    const quoteResult =
        getObjectAt(tweetResult, ["quoted_status_result", "result"]) ??
        getObjectAt(tweetResult, ["quotedStatusResult", "result"]);

    return {
        id,
        author,
        text,
        createdAt: getString(legacy.created_at) ?? new Date().toISOString(),
        displayTextRange: note
            ? [0, Array.from(text).length]
            : parseDisplayTextRange(legacy.display_text_range),
        entities: parseEntities(noteEntities ?? legacyEntities),
        media: parseMedia(tweetResult, legacy),
        card: parseCard(tweetResult),
        poll: parsePoll(tweetResult),
        quote: quoteResult ? parseTweetResult(quoteResult, seenTweetIds) : null,
        retweet: retweetResult
            ? parseTweetResult(retweetResult, seenTweetIds)
            : null,
        source: getString(legacy.source) ?? null,
        replyToStatusId: getString(legacy.in_reply_to_status_id_str),
        replyToUsername: getString(legacy.in_reply_to_screen_name),
        debugJson: tweetResult,
    };
}

function findTimelineEntries(json: unknown): JsonObject[] {
    const result: JsonObject[] = [];
    visit(json, value => {
        const entries = getArray(getObject(value)?.entries);
        if (
            entries.length > 0 &&
            entries.every(entry => getString(getObject(entry)?.entryId))
        ) {
            result.push(
                ...entries.flatMap(entry => {
                    const entryObject = getObject(entry);
                    return entryObject ? [entryObject] : [];
                })
            );
        }
    });
    return result;
}

function findTimelineItemContents(entry: JsonObject): JsonObject[] {
    const contents: JsonObject[] = [];
    const content = getObject(entry.content);
    const itemContent = getObject(content?.itemContent);
    if (itemContent) {
        contents.push(itemContent);
    }
    for (const item of getArray(content?.items)) {
        const nestedItemContent = getObjectAt(item, ["item", "itemContent"]);
        if (nestedItemContent) {
            contents.push(nestedItemContent);
        }
    }
    return contents;
}

function parseEntities(entities: JsonObject | null): TwitterEntities {
    if (!entities) {
        return {};
    }
    return {
        urls: getArray(entities.urls).flatMap(parseUrlEntity),
        media: getArray(entities.media).flatMap(parseUrlEntity),
        hashtags: getArray(entities.hashtags).flatMap(entity => {
            const obj = getObject(entity);
            const [start, end] = parseIndices(obj?.indices);
            const text = getString(obj?.text);
            return text && end > start ? [{start, end, text}] : [];
        }),
        userMentions: getArray(entities.user_mentions).flatMap(entity => {
            const obj = getObject(entity);
            const [start, end] = parseIndices(obj?.indices);
            const username = getString(obj?.screen_name);
            return username && end > start ? [{start, end, username}] : [];
        }),
    };
}

function parseUrlEntity(entity: unknown): TwitterUrlEntity[] {
    const obj = getObject(entity);
    const [start, end] = parseIndices(obj?.indices);
    const url = getString(obj?.url);
    if (!url || end <= start) {
        return [];
    }
    return [
        {
            start,
            end,
            url,
            expandedUrl: getString(obj?.expanded_url) ?? undefined,
            displayUrl: getString(obj?.display_url) ?? undefined,
        },
    ];
}

function parseMedia(
    tweetResult: JsonObject,
    legacy: JsonObject
): TwitterMedia[] {
    const extendedMedia = getArray(getObject(legacy.extended_entities)?.media);
    if (extendedMedia.length > 0) {
        return extendedMedia.flatMap(parseLegacyMedia);
    }

    const entityMedia = getArray(getObject(legacy.entities)?.media);
    if (entityMedia.length > 0) {
        return entityMedia.flatMap(parseLegacyMedia);
    }

    const mediaEntities = getArray(tweetResult.media_entities);
    return mediaEntities.flatMap(parseApiMedia);
}

function parseLegacyMedia(media: unknown): TwitterMedia[] {
    const obj = getObject(media);
    if (!obj) {
        return [];
    }
    const id =
        getString(obj.id_str) ??
        getString(obj.media_key) ??
        crypto.randomUUID();
    const mediaUrl = getString(obj.media_url_https) ?? getString(obj.media_url);
    const description =
        getString(obj.ext_alt_text) ?? getString(obj.type) ?? "media";
    const type = getString(obj.type);
    if (type === "photo" && mediaUrl) {
        return [
            {
                id,
                type: "image",
                url: mediaUrl,
                previewUrl: mediaUrl,
                description,
            },
        ];
    }
    if (type === "video" || type === "animated_gif") {
        const variant = bestVideoVariant(
            getArray(getObject(obj.video_info)?.variants)
        );
        const variantUrl = getString(variant?.url);
        if (!variantUrl) {
            return mediaUrl
                ? [
                      {
                          id,
                          type: "image",
                          url: mediaUrl,
                          previewUrl: mediaUrl,
                          description,
                      },
                  ]
                : [];
        }
        return [
            {
                id,
                type: type === "animated_gif" ? "gifv" : "video",
                url: variantUrl,
                posterUrl: mediaUrl ?? undefined,
                previewUrl: mediaUrl ?? undefined,
                description,
            },
        ];
    }
    return [];
}

function parseApiMedia(media: unknown): TwitterMedia[] {
    const mediaInfo = getObjectAt(media, [
        "media_results",
        "result",
        "media_info",
    ]);
    if (!mediaInfo) {
        return [];
    }
    const id = getString(getObject(media)?.id_str) ?? crypto.randomUUID();
    const typename = getString(mediaInfo.__typename);
    if (typename === "ApiImage") {
        const url = getString(mediaInfo.original_img_url);
        return url
            ? [
                  {
                      id,
                      type: "image",
                      url,
                      previewUrl: url,
                      description: getString(mediaInfo.alt_text) ?? "image",
                  },
              ]
            : [];
    }
    if (typename === "ApiVideo" || typename === "ApiGif") {
        const variant = bestVideoVariant(getArray(mediaInfo.variants));
        const variantUrl = getString(variant?.url);
        if (!variantUrl) {
            return [];
        }
        const posterUrl = getString(
            getObject(mediaInfo.preview_image)?.original_img_url
        );
        return [
            {
                id,
                type: typename === "ApiGif" ? "gifv" : "video",
                url: variantUrl,
                previewUrl: posterUrl ?? undefined,
                posterUrl: posterUrl ?? undefined,
                description: getString(mediaInfo.alt_text) ?? "video",
            },
        ];
    }
    return [];
}

function parseCard(tweetResult: JsonObject): TwitterCard | null {
    const card = getObject(getObject(tweetResult.card)?.legacy);
    if (!card) {
        return null;
    }
    const title = getBindingString(card, "title");
    const url =
        getBindingString(card, "card_url") ??
        getBindingString(card, "vanity_url") ??
        getString(card.url);
    if (!title || !url || getString(card.name)?.includes("poll")) {
        return null;
    }
    return {
        title,
        url,
        description: getBindingString(card, "description"),
        imageUrl:
            getBindingImageUrl(card, "thumbnail_image_large") ??
            getBindingImageUrl(card, "summary_photo_image_large") ??
            getBindingImageUrl(card, "player_image_large"),
    };
}

function parsePoll(tweetResult: JsonObject): TwitterPoll | null {
    const card = getObject(getObject(tweetResult.card)?.legacy);
    if (!card || !getString(card.name)?.includes("poll")) {
        return null;
    }
    const options = [];
    let votesCount = 0;
    for (let i = 1; i <= 4; i++) {
        const title = getBindingString(card, `choice${i}_label`);
        if (!title) {
            continue;
        }
        const optionVotes =
            Number(getBindingString(card, `choice${i}_count`) ?? "0") || 0;
        votesCount += optionVotes;
        options.push({title, votesCount: optionVotes});
    }
    return options.length > 0 ? {votesCount, options} : null;
}

function getBindingString(card: JsonObject, key: string): string | null {
    const value = getBindingValue(card, key);
    return (
        getString(value?.string_value) ??
        getString(value?.scribe_key) ??
        getString(value)
    );
}

function getBindingImageUrl(card: JsonObject, key: string): string | null {
    return getString(getObject(getBindingValue(card, key)?.image_value)?.url);
}

function getBindingValue(card: JsonObject, key: string): JsonObject | null {
    const bindingValues = getObject(card.binding_values);
    if (bindingValues) {
        return getObject(getObject(bindingValues[key])?.value);
    }
    for (const binding of getArray(card.binding_values)) {
        const obj = getObject(binding);
        if (getString(obj?.key) === key) {
            return getObject(obj?.value);
        }
    }
    return null;
}

function bestVideoVariant(variants: unknown[]): JsonObject | null {
    const parsedVariants = variants.flatMap(variant => {
        const obj = getObject(variant);
        return obj && getString(obj.url) ? [obj] : [];
    });
    return (
        parsedVariants.sort(
            (a, b) =>
                (getNumber(b.bit_rate) ?? getNumber(b.bitrate) ?? 0) -
                (getNumber(a.bit_rate) ?? getNumber(a.bitrate) ?? 0)
        )[0] ?? null
    );
}

function parseDisplayTextRange(value: unknown): [number, number] | undefined {
    const range = getArray(value);
    const start = getNumber(range[0]);
    const end = getNumber(range[1]);
    return start !== null && end !== null ? [start, end] : undefined;
}

function parseIndices(value: unknown): [number, number] {
    const indices = getArray(value);
    return [getNumber(indices[0]) ?? 0, getNumber(indices[1]) ?? 0];
}

function cacheAgeSeconds<T>(cached: CachedValue<T>): number {
    return (Date.now() - new Date(cached.fetchedAtIso).getTime()) / 1000;
}

function stableHash(value: string): number {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) {
        hash = (hash * 33) ^ value.charCodeAt(i);
    }
    return hash >>> 0;
}

function sessionLabel(session: TweeterFeederSession): string {
    return session.username ?? session.id ?? sessionCooldownId(session);
}

function sessionCooldownId(session: TweeterFeederSession): string {
    return (
        session.id ??
        session.username ??
        `hash-${stableHash(session.authToken)}`
    );
}

function twitterErrorMessage(errors: unknown[]): string | null {
    const messages = errors
        .flatMap(error => getString(getObject(error)?.message) ?? [])
        .filter(Boolean);
    return messages.length > 0 ? messages.join("; ") : null;
}

function summarizeTwitterErrors(errors: unknown[]): unknown[] {
    return errors.map(error => {
        const obj = getObject(error);
        return {
            code: getNumber(obj?.code),
            message: getString(obj?.message),
            kind: getString(obj?.kind),
        };
    });
}

function twitterErrorsNeedCooldown(errors: unknown[]): boolean {
    return errors.some(error => {
        const code = getNumber(getObject(error)?.code);
        return code === 88 || code === 89 || code === 239 || code === 326;
    });
}

type JsonObject = Record<string, unknown>;

function getObject(value: unknown): JsonObject | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as JsonObject)
        : null;
}

function getObjectAt(value: unknown, path: string[]): JsonObject | null {
    let current: unknown = value;
    for (const key of path) {
        const obj = getObject(current);
        if (!obj) {
            return null;
        }
        current = obj[key];
    }
    return getObject(current);
}

function getValueAt(value: unknown, path: string[]): unknown {
    let current: unknown = value;
    for (const key of path) {
        const obj = getObject(current);
        if (!obj) {
            return undefined;
        }
        current = obj[key];
    }
    return current;
}

function getArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string | null {
    return typeof value === "string" && value ? value : null;
}

function getNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

function visit(value: unknown, visitor: (value: unknown) => void): void {
    visitor(value);
    if (Array.isArray(value)) {
        for (const item of value) {
            visit(item, visitor);
        }
    } else {
        const obj = getObject(value);
        if (obj) {
            for (const child of Object.values(obj)) {
                visit(child, visitor);
            }
        }
    }
}
