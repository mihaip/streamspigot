import {parseFeedOptions} from "$lib/feeder/feed-options";
import {TweeterFeederController} from "$lib/tweeter-feeder/controller";
import type {RequestHandler} from "@sveltejs/kit";

export const GET: RequestHandler = async event => {
    const controller = new TweeterFeederController(event);
    return controller.handleSearchFeed(
        event.url.searchParams.get("q")?.trim() ?? "",
        parseFeedOptions(event.url.searchParams)
    );
};
