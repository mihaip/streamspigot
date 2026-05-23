import {parseFeedOptions} from "$lib/feeder/feed-options";
import {SkyFeederController} from "$lib/sky-feeder/controller";
import {error, type RequestHandler} from "@sveltejs/kit";

export const GET: RequestHandler = async event => {
    const {feedId} = event.params;
    if (!feedId) {
        return error(400, "Invalid feed ID");
    }

    const controller = new SkyFeederController(event);
    return controller.handleTimelineFeed(
        feedId,
        parseFeedOptions(event.url.searchParams)
    );
};
