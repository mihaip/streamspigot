import {APP_NAME} from "$lib/constants";
import {createRestAPIClient} from "$lib/masto";
import type {mastodon} from "masto";
import type {MastoFeederSession} from "./types";
import {renderFeed, type FeedOptions, type FeedOutput} from "$lib/status/feed";
import {toStatus, type MastodonAdapterEnv} from "./status-adapter";

export async function renderTimelineFeed(
    session: MastoFeederSession,
    feedUrl: string,
    homeUrl: string,
    env: MastodonAdapterEnv,
    options: FeedOptions = {}
): Promise<FeedOutput> {
    const masto = createRestAPIClient({
        url: session.instanceUrl,
        accessToken: session.accessToken,
    });
    const user = await masto.v1.accounts.verifyCredentials();
    const title = `@${user.username} Timeline`;

    const updatedDate = new Date();
    // We could put in a per-status author name with the post author's screen name,
    // but that would just duplicate information in the body. By only having a
    // feed-level author, the feed is still valid, but feed readers won't display
    // a per-post author line.
    const authorName = `${APP_NAME} : Masto Feeder`;

    // Include items from the past 12 hours, which should be enough to cover
    // most federation delays.
    const {debug} = options;
    const limitTime = Date.now() - 12 * 60 * 60 * 1000;
    let maxId: string | undefined;
    const statuses: mastodon.v1.Status[] = [];
    const statusIds = new Set<string>();
    while (true) {
        const chunkStatuses = await masto.v1.timelines.home.list({
            limit: debug ? 10 : 40,
            maxId,
        });
        const newChunkStatuses = chunkStatuses.filter(
            s =>
                new Date(s.createdAt).getTime() >= limitTime &&
                !statusIds.has(s.id)
        );
        if (newChunkStatuses.length === 0) {
            break;
        }
        statuses.push(...newChunkStatuses);
        // Ensure that we don't get stuck in a loop if the server returns
        // the same chunk over and over again (which Sky Bridge appears to).
        for (const s of newChunkStatuses) {
            statusIds.add(s.id);
        }
        maxId = newChunkStatuses.at(-1)!.id;
        if (debug) {
            break;
        }
    }

    const renderStatuses = statuses.map(status => toStatus(status, env));

    return renderFeed(
        renderStatuses,
        {
            feedUrl,
            homeUrl,
            title,
            updatedDate,
            authorName,
        },
        options
    );
}
