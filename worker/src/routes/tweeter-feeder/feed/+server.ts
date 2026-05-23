import {TweeterFeederController} from "$lib/tweeter-feeder/controller";
import type {FeedOutputType} from "$lib/status/feed";
import {errorToMessage} from "$lib/tweeter-feeder/fetcher";
import {error, isHttpError, type RequestHandler} from "@sveltejs/kit";

export const GET: RequestHandler = async event => {
    const {searchParams} = event.url;
    const debug = searchParams.get("debug") === "true";
    const output = parseOutput(searchParams);
    const includeStatusJson = searchParams.get("includeStatusJson") === "true";

    try {
        const controller = new TweeterFeederController(event);
        return await controller.handleFeed(searchParams.get("usernames"), {
            debug,
            output,
            includeStatusJson,
        });
    } catch (e) {
        if (isHttpError(e)) {
            const message = errorToMessage(e.body?.message);
            return error(e.status, message);
        }
        const message = errorToMessage(e);
        console.error("Tweeter Feeder request failed", {message});
        return error(500, message);
    }
};

function parseOutput(searchParams: URLSearchParams): FeedOutputType {
    const output = searchParams.get("output");
    if (output === "html" || output === "atom" || output === "json") {
        return output;
    }
    return searchParams.get("html") === "true" ? "html" : "atom";
}
