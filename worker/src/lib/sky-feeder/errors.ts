import {APP_NAME} from "$lib/constants";
import {errorMessage, errorSummary} from "$lib/feeder/log";
import {escapeHtml, escapeHtmlAttribute} from "$lib/html";
import {renderFeed, type FeedOptions, type FeedOutput} from "$lib/status/feed";
import type {Status} from "$lib/status";
import type {SkyOAuthSessionHashMaterial} from "./kv";
import type {SkyFeederSession} from "./types";

export async function renderTimelineErrorFeed({
    session,
    feedUrl,
    homeUrl,
    timeZone,
    options,
    error,
    kind,
    oauth,
}: RenderTimelineErrorFeedOptions): Promise<FeedOutput> {
    const now = new Date();
    return renderFeed(
        [
            await timelineErrorStatus({
                session,
                homeUrl,
                timeZone,
                options,
                error,
                kind,
                now,
                oauth,
            }),
        ],
        {
            feedUrl,
            homeUrl,
            title: `@${session.handle} Bluesky Timeline`,
            updatedDate: now,
            authorName: `${APP_NAME} : Sky Feeder`,
        },
        options
    );
}

export async function timelineErrorSignature(
    kind: SkyFeederTimelineErrorKind,
    error: unknown
): Promise<string> {
    return hashJSON({
        version: 1,
        provider: "sky-feeder",
        kind,
        error: stableErrorSummary(errorSummary(error)),
    });
}

export type SkyFeederTimelineErrorKind = "auth" | "error";

type RenderTimelineErrorFeedOptions = {
    session: SkyFeederSession;
    feedUrl: string;
    homeUrl: string;
    timeZone: string;
    options: FeedOptions;
    error: unknown;
    kind: SkyFeederTimelineErrorKind;
    oauth: SkyOAuthSessionHashMaterial | null;
};

type TimelineErrorStatusOptions = {
    session: SkyFeederSession;
    homeUrl: string;
    timeZone: string;
    options: FeedOptions;
    error: unknown;
    kind: SkyFeederTimelineErrorKind;
    now: Date;
    oauth: SkyOAuthSessionHashMaterial | null;
};

async function timelineErrorStatus({
    session,
    homeUrl,
    timeZone,
    options,
    error,
    kind,
    now,
    oauth,
}: TimelineErrorStatusOptions): Promise<Status> {
    const message =
        kind === "auth"
            ? "Sky Feeder authorization expired. Sign in again to restore this feed URL."
            : "Sky Feeder could not update this feed. Sign in again or check the Stream Spigot logs for details.";
    const details = errorMessage(error);
    const errorDetails = errorSummary(error);
    const hash = await hashJSON({
        version: 1,
        provider: "sky-feeder",
        kind,
        session: {
            sessionId: session.sessionId,
            feedId: session.feedId,
            did: session.did,
            handle: session.handle,
        },
        oauth,
        error: errorDetails,
    });
    const permalink = `${homeUrl}#feed-error-${hash}`;
    const createdAtIso = now.toISOString();
    const detailsHtml = options.debug
        ? `<p><code>${escapeHtml(details)}</code></p>`
        : "";

    return {
        id: `tag:streamspigot.com,2026:sky-feeder-error:${hash}`,
        permalink,
        provider: "bluesky",
        author: {
            displayName: `${APP_NAME} : Sky Feeder`,
            username: "sky-feeder",
            url: homeUrl,
            avatarUrl: TRANSPARENT_PIXEL_URL,
        },
        createdAtIso,
        updatedAtIso: createdAtIso,
        createdAtLabel: formatCreatedAt(createdAtIso, timeZone),
        titleText: message,
        headlineText: message,
        contentHtml: `<p>${escapeHtml(message)}</p><p><a href="${escapeHtmlAttribute(homeUrl)}" rel="external">Open Sky Feeder</a></p>${detailsHtml}`,
        attachments: [],
        poll: null,
        card: null,
        quote: null,
        repost: null,
        applicationName: APP_NAME,
        parentUrl: null,
        debugJson: {
            kind,
            error: errorDetails,
            session: {
                did: session.did,
                handle: session.handle,
                feedId: session.feedId,
            },
            oauth,
        },
    };
}

const TRANSPARENT_PIXEL_URL =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

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

function formatCreatedAt(createdAt: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
        timeZone,
    }).format(new Date(createdAt));
}
