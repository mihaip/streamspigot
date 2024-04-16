import {MastoFeederController} from "$lib/controllers/masto-feeder";
import type {Actions} from "./$types";
import {fail} from "@sveltejs/kit";

export const actions: Actions = {
    "sign-in": async ({cookies, request, platform, url}) => {
        const formData = await request.formData();
        const instanceUrl = formData.get("instance_url") as string | null;
        if (!instanceUrl) {
            return fail(400, {instance_url: instanceUrl, missing: true});
        }

        const controller = new MastoFeederController(
            platform,
            url.protocol,
            url.host
        );
        return controller.handleSignIn(instanceUrl, cookies);
    },
};
