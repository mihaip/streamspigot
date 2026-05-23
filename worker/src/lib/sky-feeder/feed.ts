import {APP_NAME} from "$lib/constants";
import {renderFeed, type FeedOptions, type FeedOutput} from "$lib/status/feed";
import {AppBskyFeedDefs, type Agent} from "@atproto/api";
import type {SkyFeederSession} from "./types";
import {toStatus, type BlueskyAdapterEnv} from "./status-adapter";

export async function renderTimelineFeed(
    agent: Agent,
    session: SkyFeederSession,
    feedUrl: string,
    homeUrl: string,
    env: BlueskyAdapterEnv,
    options: FeedOptions = {}
): Promise<FeedOutput> {
    const profile = await agent.getProfile({actor: session.did});
    const handle = profile.data.handle;
    const title = `@${handle} Bluesky Timeline`;
    const updatedDate = new Date();
    const authorName = `${APP_NAME} : Sky Feeder`;

    const posts = await fetchRecentTimelinePosts(agent, session.did, options);
    const statuses = posts.map(post => toStatus(post, env));

    return renderFeed(
        statuses,
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

async function fetchRecentTimelinePosts(
    agent: Agent,
    viewerDid: string,
    options: FeedOptions
): Promise<AppBskyFeedDefs.FeedViewPost[]> {
    const limitTime = Date.now() - 12 * 60 * 60 * 1000;
    const posts: AppBskyFeedDefs.FeedViewPost[] = [];
    const eventKeys = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;

    while (true) {
        const response = await agent.getTimeline({
            limit: options.debug ? 10 : 50,
            cursor,
        });
        const freshPosts = response.data.feed.filter(item => {
            const eventTime = timelineEventTimeMillis(item);
            return eventTime >= limitTime;
        });
        if (freshPosts.length === 0) {
            break;
        }

        const newPosts = freshPosts.filter(item => {
            const key = timelineEventKey(item);
            if (eventKeys.has(key)) {
                return false;
            }
            eventKeys.add(key);
            return true;
        });
        const visiblePosts = newPosts.filter(item =>
            shouldIncludeTimelinePost(item, viewerDid)
        );
        posts.push(...visiblePosts);

        const nextCursor = response.data.cursor;
        if (!nextCursor || options.debug || cursors.has(nextCursor)) {
            break;
        }
        cursors.add(nextCursor);
        cursor = nextCursor;
    }

    return posts;
}

function shouldIncludeTimelinePost(
    item: AppBskyFeedDefs.FeedViewPost,
    viewerDid: string
): boolean {
    const parent = item.reply?.parent;
    if (!parent) {
        return true;
    }
    if (!AppBskyFeedDefs.isPostView(parent)) {
        return false;
    }

    const parentDid = parent.author.did;
    const authorDid = item.post.author.did;
    return (
        parentDid === authorDid ||
        parentDid === viewerDid ||
        Boolean(parent.author.viewer?.following)
    );
}

function timelineEventKey(item: AppBskyFeedDefs.FeedViewPost): string {
    if (AppBskyFeedDefs.isReasonRepost(item.reason)) {
        return `${item.post.uri}#repost:${item.reason.by.did}:${item.reason.indexedAt}`;
    }
    return `${item.post.uri}#post:${item.post.indexedAt}`;
}

function timelineEventTimeMillis(item: AppBskyFeedDefs.FeedViewPost): number {
    const eventTime = AppBskyFeedDefs.isReasonRepost(item.reason)
        ? item.reason.indexedAt
        : item.post.indexedAt;
    const millis = new Date(eventTime).getTime();
    return Number.isFinite(millis) ? millis : 0;
}
