import {MastoFeederController} from "$lib/masto-feeder/controller";
import {createRestAPIClient} from "masto";
import {fail} from "@sveltejs/kit";

export async function load(event) {
    const {session} = await event.parent();
    if (!session) {
        return;
    }

    const controller = new MastoFeederController(event);

    const masto = createRestAPIClient({
        url: session.instanceUrl,
        accessToken: session.accessToken,
    });
    const user = await masto.v1.accounts.verifyCredentials();

    return {
        user,
        timelineFeedUrl: controller.timelineFeedUrl(session),
    };
}

export const actions = {
    "sign-in": async event => {
        const formData = await event.request.formData();
        const instanceUrl = formData.get("instance_url") as string | null;
        ("");
        if (!instanceUrl) {
            return fail(400, {instance_url: instanceUrl, missing: true});
        }

        const controller = new MastoFeederController(event);
        return controller.handleSignIn(instanceUrl);
    },
    "sign-out": async event => {
        const controller = new MastoFeederController(event);
        return controller.handleSignOut();
    },
    "reset-feed-id": async event => {
        const controller = new MastoFeederController(event);
        return controller.handleResetFeedId();
    },
};
