import type {Agent} from "@atproto/api";
import {sortSearchStatuses} from "$lib/feeder/search";
import type {FeedOptions} from "$lib/status/feed";
import {toStatusFromPost, type BlueskyAdapterEnv} from "./status-adapter";

export const SEARCH_RESULT_LIMIT = 50;

export async function fetchSearchStatuses(
    agent: Agent,
    query: string,
    env: BlueskyAdapterEnv,
    options: FeedOptions = {}
) {
    const limit = options.debug ? 10 : SEARCH_RESULT_LIMIT;
    const response = await agent.app.bsky.feed.searchPosts({
        q: query,
        sort: "latest",
        limit,
    });
    return sortSearchStatuses(
        response.data.posts.map(post => toStatusFromPost(post, env))
    ).slice(0, limit);
}
