import {searchFeedUrl, searchQueryError} from "./search";

export function generateSubscribeUrl(
    input: string,
    origin: string
): string | null {
    const url = parseTwitterUrl(input);
    if (!url) {
        return null;
    }
    if (/^\/search\/?$/.test(url.pathname)) {
        const query = url.searchParams.get("q")?.trim() ?? "";
        if (searchQueryError(query)) {
            return null;
        }
        const feedUrl = new URL("/tweeter-feeder/feed/search", origin);
        return `feed:${searchFeedUrl(feedUrl.toString(), query, "json")}`;
    }

    const username = twitterUsernameFromUrl(url);
    if (!username) {
        return null;
    }

    const feedUrl = new URL("/tweeter-feeder/feed", origin);
    feedUrl.searchParams.set("usernames", username);
    feedUrl.searchParams.set("output", "json");
    return `feed:${feedUrl}`;
}

function parseTwitterUrl(input: string): URL | null {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        return null;
    }
    if (
        !["http:", "https:"].includes(url.protocol) ||
        !TWITTER_HOSTS.has(url.hostname) ||
        url.username ||
        url.password ||
        url.port
    ) {
        return null;
    }
    return url;
}

function twitterUsernameFromUrl(url: URL): string | null {
    const match = /^\/([a-zA-Z0-9_]{1,15})(?:\/status\/[0-9]+)?\/?$/.exec(
        url.pathname
    );
    const username = match?.[1].toLowerCase();
    return username && !RESERVED_TWITTER_PATHS.has(username) ? username : null;
}

const TWITTER_HOSTS = new Set([
    "x.com",
    "www.x.com",
    "twitter.com",
    "www.twitter.com",
    "mobile.twitter.com",
]);

const RESERVED_TWITTER_PATHS = new Set([
    "about",
    "account",
    "accounts",
    "compose",
    "download",
    "explore",
    "hashtag",
    "home",
    "i",
    "intent",
    "jobs",
    "login",
    "logout",
    "messages",
    "notifications",
    "oauth",
    "privacy",
    "search",
    "settings",
    "share",
    "signup",
    "tos",
    "widgets",
]);
