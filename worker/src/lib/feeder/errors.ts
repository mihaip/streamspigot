import {APP_NAME} from "$lib/constants";
import {errorMessage, errorSummary} from "./log";
import {feedOutputResponse, jsonResponse} from "./response";
import {escapeHtml, escapeHtmlAttribute} from "$lib/html";
import type {KV} from "$lib/kv";
import {renderFeed, type FeedOptions, type FeedOutput} from "$lib/status/feed";
import type {Status, StatusProvider} from "$lib/status";

export class FeedErrors {
    #kv: KV;
    #provider: FeedErrorProvider;

    constructor(kv: KV, provider: FeedErrorProvider) {
        this.#kv = kv;
        this.#provider = provider;
    }

    async respond({
        feedId,
        error,
        kind,
        options,
        logContext,
        renderErrorFeed,
    }: FeedErrorResponseOptions): Promise<Response> {
        const state = await this.#record(feedId, error, kind);
        console.error(
            `${this.#provider.name} feed ${kind === "auth" ? "authorization failed" : "failed"}`,
            {
                ...logContext,
                message: errorMessage(error),
                error: errorSummary(error),
                errorState: state,
            }
        );
        if (kind === "error" && state.count < GENERIC_ERROR_ITEM_THRESHOLD) {
            return transientErrorResponse(this.#provider.name, state, options);
        }
        return feedOutputResponse(await renderErrorFeed());
    }

    async clear(feedId: string): Promise<void> {
        try {
            await this.#kv.delete(this.#key(feedId));
        } catch (error) {
            this.#logStateError("clear", feedId, error);
        }
    }

    async #record(
        feedId: string,
        error: unknown,
        kind: FeedErrorKind
    ): Promise<FeedErrorState> {
        const now = new Date().toISOString();
        const signature = await hashJSON({
            version: 1,
            provider: this.#provider.id,
            kind,
            error: stableErrorSummary(errorSummary(error)),
        });
        let state: FeedErrorState = {
            kind,
            signature,
            count: 1,
            firstSeenAt: now,
            lastSeenAt: now,
            lastMessage: errorMessage(error),
        };
        try {
            const previous = await this.#kv.getJSON<FeedErrorState>(
                this.#key(feedId)
            );
            if (previous?.kind === kind && previous.signature === signature) {
                state = {
                    ...state,
                    count: previous.count + 1,
                    firstSeenAt: previous.firstSeenAt,
                };
            }
            await this.#kv.putJSON(this.#key(feedId), state, {
                expirationTtl: FEED_ERROR_STATE_TTL_SECONDS,
            });
        } catch (error) {
            this.#logStateError("update", feedId, error);
        }
        return state;
    }

    #key(feedId: string): string {
        return `feeder:feed_error_state:${this.#provider.id}:${feedId}`;
    }

    #logStateError(operation: string, feedId: string, error: unknown): void {
        console.error(
            `${this.#provider.name} feed error state ${operation} failed`,
            {
                feedId,
                message: errorMessage(error),
                error: errorSummary(error),
            }
        );
    }
}

export async function renderErrorFeed(
    config: RenderErrorFeedOptions
): Promise<FeedOutput> {
    const now = new Date();
    return renderFeed(
        [await errorStatus(config, now)],
        {
            feedUrl: config.feedUrl,
            homeUrl: config.homeUrl,
            title: config.title,
            updatedDate: now,
            authorName: `${APP_NAME} : ${config.provider.name}`,
        },
        config.options
    );
}

export type FeedErrorKind = "auth" | "error";

export type FeedErrorProvider = {
    id: string;
    name: string;
    statusProvider: StatusProvider;
};

type FeedErrorState = {
    kind: FeedErrorKind;
    signature: string;
    count: number;
    firstSeenAt: string;
    lastSeenAt: string;
    lastMessage: string;
};

type FeedErrorResponseOptions = {
    feedId: string;
    error: unknown;
    kind: FeedErrorKind;
    options: FeedOptions;
    logContext: Record<string, unknown>;
    renderErrorFeed: () => Promise<FeedOutput>;
};

type RenderErrorFeedOptions = {
    provider: FeedErrorProvider;
    title: string;
    message: string;
    feedUrl: string;
    homeUrl: string;
    timeZone: string;
    options: FeedOptions;
    error: unknown;
    kind: FeedErrorKind;
    // Providers supply only safe diagnostics, never complete credential bundles.
    identity: Record<string, unknown>;
    diagnostics?: Record<string, unknown>;
};

const GENERIC_ERROR_ITEM_THRESHOLD = 3;
const FEED_ERROR_STATE_TTL_SECONDS = 30 * 24 * 60 * 60;
const TRANSPARENT_PIXEL_URL =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function transientErrorResponse(
    providerName: string,
    state: FeedErrorState,
    options: FeedOptions
): Response {
    const message = `${providerName} could not update this feed. The error looks transient, so no feed item was generated yet.`;
    const headers = new Headers({"Retry-After": "300"});
    if (options.output === "json") {
        return jsonResponse(
            {
                message,
                error: {
                    kind: state.kind,
                    count: state.count,
                    threshold: GENERIC_ERROR_ITEM_THRESHOLD,
                    firstSeenAt: state.firstSeenAt,
                    lastSeenAt: state.lastSeenAt,
                },
            },
            {status: 503, headers}
        );
    }
    return new Response(message, {status: 503, headers});
}

async function errorStatus(
    {
        provider,
        message,
        homeUrl,
        timeZone,
        options,
        error,
        kind,
        identity,
        diagnostics,
    }: RenderErrorFeedOptions,
    now: Date
): Promise<Status> {
    const errorDetails = errorSummary(error);
    const hash = await hashJSON({
        version: 1,
        provider: provider.id,
        kind,
        identity,
        diagnostics,
        error: errorDetails,
    });
    const permalink = `${homeUrl}#feed-error-${hash}`;
    const createdAtIso = now.toISOString();
    const detailsHtml = options.debug
        ? `<p><code>${escapeHtml(errorMessage(error))}</code></p>`
        : "";
    return {
        id: `tag:streamspigot.com,2026:${provider.id}-error:${hash}`,
        permalink,
        provider: provider.statusProvider,
        author: {
            displayName: `${APP_NAME} : ${provider.name}`,
            username: provider.id,
            url: homeUrl,
            avatarUrl: TRANSPARENT_PIXEL_URL,
        },
        createdAtIso,
        updatedAtIso: createdAtIso,
        createdAtLabel: new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "numeric",
            hour12: true,
            timeZone,
        }).format(now),
        titleText: message,
        headlineText: message,
        contentHtml: `<p>${escapeHtml(message)}</p><p><a href="${escapeHtmlAttribute(homeUrl)}" rel="external">Open ${escapeHtml(provider.name)}</a></p>${detailsHtml}`,
        attachments: [],
        poll: null,
        card: null,
        quote: null,
        repost: null,
        applicationName: APP_NAME,
        parentUrl: null,
        debugJson: {kind, error: errorDetails, ...diagnostics},
    };
}

async function hashJSON(value: unknown): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value))
    );
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function stableErrorSummary(summary: ReturnType<typeof errorSummary>): unknown {
    return {
        name: summary.name,
        message: summary.message,
        code: summary.code,
        status: summary.status,
        cause: summary.cause ? stableErrorSummary(summary.cause) : undefined,
    };
}
