import {
    SkyFeederController,
    isOAuthSessionUnavailable,
    resolvePrefs,
} from "$lib/sky-feeder/controller";
import {errorMessage} from "$lib/feeder/log";
import {isValidHandle} from "@atproto/syntax";
import {fail} from "@sveltejs/kit";

const SUPPORTED_TIME_ZONES = new Set(Intl.supportedValuesOf("timeZone"));

export async function load(event) {
    const authError = authErrorMessage(
        event.url.searchParams.get("auth_error")
    );
    const {session} = await event.parent();
    if (!session) {
        return authError ? {authError} : undefined;
    }

    const controller = new SkyFeederController(event);
    let profile;
    try {
        profile = await controller.getProfile(session);
    } catch (error) {
        if (isOAuthSessionUnavailable(error)) {
            controller.clearSessionCookie();
            return {
                session: undefined,
                authError:
                    "Sky Feeder authorization expired. Sign in with Bluesky again to reconnect your feed.",
            };
        }
        throw error;
    }
    const prefs = resolvePrefs(session.prefs);

    return {
        authError,
        profile,
        prefs,
        timelineFeedUrl: controller.timelineFeedUrl(session),
        timelineJsonFeedUrl: controller.timelineFeedUrl(session, "json"),
    };
}

export const actions = {
    "sign-in": async event => {
        const formData = await event.request.formData();
        const rawHandle = formData.get("handle");
        const handle = normalizeHandle(rawHandle);
        const submittedHandle =
            typeof rawHandle === "string" ? rawHandle : undefined;

        if (!handle) {
            return fail(400, {
                handle: submittedHandle,
                error: submittedHandle
                    ? "Enter a valid Bluesky handle"
                    : "Bluesky handle is required",
            });
        }

        const controller = new SkyFeederController(event);
        try {
            return await controller.handleSignIn(handle);
        } catch (error) {
            if (isHandleResolutionError(error)) {
                return fail(400, {
                    handle: submittedHandle,
                    error: `Could not resolve @${handle}. Check that the handle is spelled correctly.`,
                });
            }
            throw error;
        }
    },
    "sign-out": async event => {
        const controller = new SkyFeederController(event);
        return controller.handleSignOut();
    },
    "reset-feed-id": async event => {
        const controller = new SkyFeederController(event);
        return controller.handleResetFeedId();
    },
    "update-prefs": async event => {
        const formData = await event.request.formData();
        const rawTimeZone = formData.get("time_zone");
        const timeZone = typeof rawTimeZone === "string" ? rawTimeZone : null;
        if (!timeZone) {
            return fail(400, {
                timezone: timeZone,
                error: "Time zone is required",
            });
        }
        if (!SUPPORTED_TIME_ZONES.has(timeZone)) {
            return fail(400, {
                timezone: timeZone,
                error: "Time zone is invalid",
            });
        }

        const controller = new SkyFeederController(event);
        return controller.handleUpdatePrefs({timeZone});
    },
};

function normalizeHandle(rawHandle: FormDataEntryValue | null): string | null {
    if (typeof rawHandle !== "string") {
        return null;
    }
    const handle = rawHandle.trim().replace(/^@/, "").toLowerCase();
    if (!handle || !isValidHandle(handle)) {
        return null;
    }
    return handle;
}

function isHandleResolutionError(error: unknown): boolean {
    return (
        errorMessage(error).startsWith("Failed to resolve identity:") ||
        errorCauseHasCode(error, "did-unknown-error")
    );
}

function errorCauseHasCode(error: unknown, code: string): boolean {
    let current = error;
    while (current && typeof current === "object") {
        if ("code" in current && current.code === code) {
            return true;
        }
        current = "cause" in current ? current.cause : undefined;
    }
    return false;
}

function authErrorMessage(code: string | null): string | undefined {
    if (code === "sign_in_failed") {
        return "Bluesky sign-in was not completed. Try signing in again.";
    }
    return undefined;
}
