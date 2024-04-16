import {MastoFeederController} from "$lib/controllers/masto-feeder";
import {error, type RequestHandler} from "@sveltejs/kit";

export const GET: RequestHandler = async ({platform, url, cookies}) => {
    const code = url.searchParams.get("code");
    if (!code) {
        return error(400, "No auth code found");
    }
    const state = url.searchParams.get("state");

    const controller = new MastoFeederController(
        platform,
        url.protocol,
        url.host
    );

    return await controller.handleSignInCallback(code, state, cookies);
};
