import {renderErrorFeed, type FeedErrorKind} from "$lib/feeder/errors";
import type {FeedOptions, FeedOutput} from "$lib/status/feed";
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
    return renderErrorFeed({
        provider: SKY_FEEDER_ERROR_PROVIDER,
        title: `@${session.handle} Bluesky Timeline`,
        message:
            kind === "auth"
                ? "Sky Feeder authorization expired. Sign in again to restore this feed URL."
                : "Sky Feeder could not update this feed. Sign in again or check the Stream Spigot logs for details.",
        feedUrl,
        homeUrl,
        timeZone,
        options,
        error,
        kind,
        identity: {
            sessionId: session.sessionId,
            feedId: session.feedId,
            did: session.did,
            handle: session.handle,
        },
        diagnostics: {
            session: {
                did: session.did,
                handle: session.handle,
                feedId: session.feedId,
            },
            oauth,
        },
    });
}

export const SKY_FEEDER_ERROR_PROVIDER = {
    id: "sky-feeder",
    name: "Sky Feeder",
    statusProvider: "bluesky",
} as const;

type RenderTimelineErrorFeedOptions = {
    session: SkyFeederSession;
    feedUrl: string;
    homeUrl: string;
    timeZone: string;
    options: FeedOptions;
    error: unknown;
    kind: FeedErrorKind;
    oauth: SkyOAuthSessionHashMaterial | null;
};
