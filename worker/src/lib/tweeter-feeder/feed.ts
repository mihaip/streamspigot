import {APP_NAME} from "$lib/constants";
import {renderFeed, type FeedOptions, type FeedOutput} from "$lib/status/feed";
import type {TwitterFetchError, TwitterTimelineResult} from "./types";
import {toStatus} from "./status-adapter";

const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export function renderTweeterFeed(
    usernames: string[],
    results: TwitterTimelineResult[],
    errors: TwitterFetchError[],
    feedUrl: string,
    homeUrl: string,
    options: FeedOptions = {}
): FeedOutput {
    const tweets = results
        .flatMap(result => result.tweets)
        .sort(
            (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
        );
    const statuses = tweets.map(tweet =>
        toStatus(tweet, {timeZone: DEFAULT_TIME_ZONE})
    );
    const updatedDate = statuses[0]
        ? new Date(statuses[0].updatedAtIso)
        : new Date();

    const output = renderFeed(
        statuses,
        {
            feedUrl,
            homeUrl,
            title: `${usernames.map(u => `@${u}`).join(", ")} Tweets`,
            updatedDate,
            authorName: `${APP_NAME} : Tweeter Feeder`,
        },
        options
    );

    if (options.output === "html") {
        output.body = injectDebugNotice(output.body, results, errors);
    }

    return output;
}

function injectDebugNotice(
    body: string,
    results: TwitterTimelineResult[],
    errors: TwitterFetchError[]
): string {
    const notices = [];
    const staleResults = results.filter(result => result.fromStaleCache);
    if (staleResults.length > 0) {
        notices.push(
            `Showing stale cached data for ${staleResults
                .map(result => `@${result.username}`)
                .join(", ")}.`
        );
    }
    if (errors.length > 0) {
        notices.push(
            `Errors were encountered for ${errors
                .map(error => `@${error.username}: ${error.message}`)
                .join("; ")}.`
        );
    }
    if (notices.length === 0) {
        return body;
    }
    const noticeHtml = `<div style="padding:.5em;background:#fdd;margin-bottom:1em">${escapeHtml(
        notices.join(" ")
    )}</div>`;
    return body.replace("<body>", `<body>${noticeHtml}`);
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
