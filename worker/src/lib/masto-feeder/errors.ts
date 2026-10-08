import {MastoHttpError, MastoTimeoutError} from "masto";
import {renderErrorFeed, type FeedErrorKind} from "$lib/feeder/errors";
import type {FeedOptions, FeedOutput} from "$lib/status/feed";
import type {MastoFeederSession} from "./types";

export async function renderTimelineErrorFeed({
    session,
    feedUrl,
    homeUrl,
    timeZone,
    options,
    error,
    kind,
}: RenderTimelineErrorFeedOptions): Promise<FeedOutput> {
    const message =
        kind === "auth"
            ? "Masto Feeder authorization expired or was denied. Sign in again to restore this feed URL."
            : error instanceof MastoTimeoutError
              ? "Masto Feeder could not update this feed because the Mastodon server did not respond within 30 seconds. Try again later."
              : "Masto Feeder could not update this feed. The Mastodon server may be temporarily unavailable. Try again later or check the Stream Spigot logs for details.";
    return renderErrorFeed({
        provider: MASTO_FEEDER_ERROR_PROVIDER,
        title: "Mastodon Timeline",
        message,
        feedUrl,
        homeUrl,
        timeZone,
        options,
        error,
        kind,
        identity: {
            sessionId: session.sessionId,
            feedId: session.feedId,
            instanceUrl: session.instanceUrl,
            mastodonId: session.mastodonId,
        },
        diagnostics: {
            session: {
                feedId: session.feedId,
                instanceUrl: session.instanceUrl,
                mastodonId: session.mastodonId,
            },
        },
    });
}

export function timelineErrorKind(error: unknown): FeedErrorKind {
    return error instanceof MastoHttpError &&
        (error.statusCode === 401 || error.statusCode === 403)
        ? "auth"
        : "error";
}

export const MASTO_FEEDER_ERROR_PROVIDER = {
    id: "masto-feeder",
    name: "Masto Feeder",
    statusProvider: "mastodon",
} as const;

type RenderTimelineErrorFeedOptions = {
    session: MastoFeederSession;
    feedUrl: string;
    homeUrl: string;
    timeZone: string;
    options: FeedOptions;
    error: unknown;
    kind: FeedErrorKind;
};
