import {MastoFeederController} from "$lib/masto-feeder/controller";

export async function load(event) {
    const controller = new MastoFeederController(event);
    return {
        session: (await controller.getSession()) ?? undefined,
    };
}
