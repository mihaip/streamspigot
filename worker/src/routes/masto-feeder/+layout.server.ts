import {MastoFeederController} from "$lib/controllers/masto-feeder";
import type {LayoutServerLoad} from "./$types";

export const load: LayoutServerLoad = async event => {
    const controller = new MastoFeederController(
        event.platform,
        event.url.protocol,
        event.url.host
    );
    return {
        mastoFeederSession:
            (await controller.getSession(event.cookies)) ?? undefined,
    };
};
