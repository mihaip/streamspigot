import {MastoFeederController} from "$lib/masto-feeder/controller";
import type {FeedOutputType} from "$lib/status/feed";
import {error, type RequestHandler} from "@sveltejs/kit";

export const GET: RequestHandler = async event => {
    const controller = new MastoFeederController(event);
    const {feedId} = event.params;
    if (!feedId) {
        return error(400, "Invalid feed ID");
    }
    const {searchParams} = event.url;
    const debug = searchParams.get("debug") === "true";
    const output = parseOutput(searchParams);
    const includeStatusJson = searchParams.get("includeStatusJson") === "true";

    return controller.handleTimelineFeed(feedId, {
        debug,
        output,
        includeStatusJson,
    });
};

function parseOutput(searchParams: URLSearchParams): FeedOutputType {
    const output = searchParams.get("output");
    if (output === "html" || output === "atom" || output === "json") {
        return output;
    }
    return searchParams.get("html") === "true" ? "html" : "atom";
}
