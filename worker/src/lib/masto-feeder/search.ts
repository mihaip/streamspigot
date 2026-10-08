import {createRestAPIClient} from "$lib/masto";
import {sortSearchStatuses} from "$lib/feeder/search";
import type {FeedOptions} from "$lib/status/feed";
import type {MastoFeederSession} from "./types";
import {toStatus, type MastodonAdapterEnv} from "./status-adapter";

export const SEARCH_RESULT_LIMIT = 40;

export async function fetchSearchStatuses(
    session: MastoFeederSession,
    query: string,
    env: MastodonAdapterEnv,
    options: FeedOptions = {}
) {
    const masto = createRestAPIClient({
        url: session.instanceUrl,
        accessToken: session.accessToken,
    });
    const limit = options.debug ? 10 : SEARCH_RESULT_LIMIT;
    // Awaiting the paginator fetches just its first page, even with a next link.
    const result = await masto.v2.search.list({
        q: query,
        type: "statuses",
        resolve: false,
        limit,
    });
    return sortSearchStatuses(
        result.statuses.map(status => toStatus(status, env))
    ).slice(0, limit);
}
