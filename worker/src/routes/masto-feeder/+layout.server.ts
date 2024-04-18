import {MastoFeederController} from "$lib/controllers/masto-feeder";

export async function load(event) {
    const controller = new MastoFeederController(event);
    return {
        session: (await controller.getSession()) ?? undefined,
    };
}
