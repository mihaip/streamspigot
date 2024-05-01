import {MastoFeederController} from "$lib/masto-feeder/controller";
import {type RequestHandler} from "@sveltejs/kit";

export const POST: RequestHandler = async event => {
    const controller = new MastoFeederController(event);
    return controller.handleImport(await event.request.json());
};
