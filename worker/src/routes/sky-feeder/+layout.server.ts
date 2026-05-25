import {SkyFeederController} from "$lib/sky-feeder/controller";

export async function load(event) {
    const controller = new SkyFeederController(event);
    return {
        session: (await controller.getSession()) ?? undefined,
    };
}
