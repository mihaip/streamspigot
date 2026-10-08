import {MastoFeederController} from "$lib/masto-feeder/controller";
import {parseFeedOptions} from "$lib/feeder/feed-options";
import {error} from "@sveltejs/kit";
import type {RequestHandler} from "./$types";

export const GET: RequestHandler = async event => {
    const controller = new MastoFeederController(event);
    if (!event.params.feedId) {
        error(400, "Invalid feed ID");
    }
    return controller.handleSearchFeed(
        event.params.feedId,
        event.url.searchParams.get("q")?.trim() ?? "",
        parseFeedOptions(event.url.searchParams)
    );
};
