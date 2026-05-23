import {SkyFeederController} from "$lib/sky-feeder/controller";
import {type RequestHandler} from "@sveltejs/kit";

export const GET: RequestHandler = async event => {
    const controller = new SkyFeederController(event);
    return controller.handleSignInCallback(event.url.searchParams);
};
