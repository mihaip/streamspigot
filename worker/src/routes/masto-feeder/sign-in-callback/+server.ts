import {MastoFeederController} from "$lib/masto-feeder/controller";
import {error, type RequestHandler} from "@sveltejs/kit";

export const GET: RequestHandler = async event => {
    const code = event.url.searchParams.get("code");
    if (!code) {
        return error(400, "No auth code found");
    }
    const state = event.url.searchParams.get("state");

    const controller = new MastoFeederController(event);

    return await controller.handleSignInCallback(code, state);
};
