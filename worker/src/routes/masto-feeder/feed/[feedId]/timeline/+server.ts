import {MastoFeederController} from "$lib/masto-feeder/controller";
import {error, type RequestHandler} from "@sveltejs/kit";

export const GET: RequestHandler = async event => {
    const controller = new MastoFeederController(event);
    const {feedId} = event.params;
    if (!feedId) {
        return error(400, "Invalid feed ID");
    }

    return controller.handleTimelineFeed(feedId);
};
