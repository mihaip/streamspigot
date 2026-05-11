import {TweeterFeederController} from "$lib/tweeter-feeder/controller";
import {errorToMessage} from "$lib/tweeter-feeder/fetcher";
import {error, isHttpError, type RequestHandler} from "@sveltejs/kit";

export const GET: RequestHandler = async event => {
    const {searchParams} = event.url;
    const debug = searchParams.get("debug") === "true";
    const html = searchParams.get("html") === "true";
    const includeStatusJson = searchParams.get("includeStatusJson") === "true";

    try {
        const controller = new TweeterFeederController(event);
        return await controller.handleFeed(searchParams.get("usernames"), {
            debug,
            html,
            includeStatusJson,
        });
    } catch (e) {
        if (isHttpError(e)) {
            const message = errorToMessage(e.body?.message);
            return error(e.status, message);
        }
        const message = errorToMessage(e);
        console.error("Tweeter Feeder request failed", {message, error: e});
        return error(500, message);
    }
};
