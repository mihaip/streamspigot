import type {FeedOptions, FeedOutputType} from "$lib/status/feed";

export function parseFeedOptions(searchParams: URLSearchParams): FeedOptions {
    return {
        debug: searchParams.get("debug") === "true",
        output: parseOutput(searchParams),
        includeStatusJson: searchParams.get("includeStatusJson") === "true",
    };
}

function parseOutput(searchParams: URLSearchParams): FeedOutputType {
    const output = searchParams.get("output");
    if (output === "html" || output === "atom" || output === "json") {
        return output;
    }
    return searchParams.get("html") === "true" ? "html" : "atom";
}
