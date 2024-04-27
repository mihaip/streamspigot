import {MastoFeederController} from "$lib/masto-feeder/controller";
import {error, type RequestHandler} from "@sveltejs/kit";

export const GET: RequestHandler = async event => {
    const controller = new MastoFeederController(event);
    const {feedId} = event.params;
    if (!feedId) {
        return error(400, "Invalid feed ID");
    }
    const debug = event.url.searchParams.get("debug") === "true";
    const html = event.url.searchParams.get("html") === "true";

    return controller.handleTimelineFeed(feedId, {debug, html});
};
