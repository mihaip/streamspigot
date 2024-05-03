import {
    MastoFeederController,
    resolvePrefs,
} from "$lib/masto-feeder/controller";
import {createRestAPIClient} from "$lib/masto";
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
    const prefs = resolvePrefs(session.prefs);

    return {
        user,
        prefs,
        timelineFeedUrl: controller.timelineFeedUrl(session),
    };
}

export const actions = {
    "sign-in": async event => {
        const formData = await event.request.formData();
        let instanceUrl = formData.get("instance_url") as string | null;

        if (!instanceUrl) {
            return fail(400, {
                instance_url: instanceUrl,
                error: "Instance URL is required",
            });
        }
        try {
            const parsedInstanceUrl = new URL(instanceUrl);
            if (
                parsedInstanceUrl.protocol !== "https:" ||
                !parsedInstanceUrl.hostname
            ) {
                return fail(400, {
                    instance_url: instanceUrl,
                    error: "Instance URL is invalid",
                });
            }
            instanceUrl =
                `${parsedInstanceUrl.protocol}//${parsedInstanceUrl.hostname}`.toLowerCase();
        } catch (e) {
            return fail(400, {
                instance_url: instanceUrl,
                error: "Instance URL is invalid",
            });
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
    "update-prefs": async event => {
        const formData = await event.request.formData();
        const controller = new MastoFeederController(event);
        let timeZone = formData.get("time_zone") as string | null;
        let useLocalUrls = formData.get("use_local_urls") === "true";
        if (!timeZone) {
            return fail(400, {
                timezone: timeZone,
                error: "Time zone is required",
            });
        }

        return controller.handleUpdatePrefs({timeZone, useLocalUrls});
    },
};
