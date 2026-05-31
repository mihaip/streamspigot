import {
    canonicalizeMastoFeederAppRecord,
    deleteMastoFeederAppRecord,
    loadMastoFeederAdminOverview,
    loadMastoFeederAppRecord,
    loadMissingMastoFeederAppRecords,
    requireMastoFeederAdmin,
    validateMastoFeederUserTokens,
} from "$lib/masto-feeder/admin";
import {fail} from "@sveltejs/kit";

export async function load(event) {
    await requireMastoFeederAdmin(event);
    return {
        overview: await loadMastoFeederAdminOverview(event),
    };
}

export const actions = {
    "load-app-record": async event => {
        await requireMastoFeederAdmin(event);
        const formData = await event.request.formData();
        const instanceUrl = formData.get("instance_url");
        if (typeof instanceUrl !== "string" || !instanceUrl) {
            return fail(400, {error: "Instance URL is required"});
        }
        return await loadMastoFeederAppRecord(event, instanceUrl);
    },
    "load-missing-app-records": async event => {
        await requireMastoFeederAdmin(event);
        return await loadMissingMastoFeederAppRecords(event);
    },
    "delete-app-record": async event => {
        await requireMastoFeederAdmin(event);
        const formData = await event.request.formData();
        const instanceUrl = formData.get("instance_url");
        if (typeof instanceUrl !== "string" || !instanceUrl) {
            return fail(400, {error: "Instance URL is required"});
        }
        const result = await deleteMastoFeederAppRecord(event, instanceUrl);
        if ("error" in result) {
            return fail(400, result);
        }
        return result;
    },
    "canonicalize-app-record": async event => {
        await requireMastoFeederAdmin(event);
        const formData = await event.request.formData();
        const instanceUrl = formData.get("instance_url");
        if (typeof instanceUrl !== "string" || !instanceUrl) {
            return fail(400, {error: "Instance URL is required"});
        }
        const result = await canonicalizeMastoFeederAppRecord(
            event,
            instanceUrl
        );
        if ("error" in result) {
            return fail(400, result);
        }
        return result;
    },
    "validate-user-tokens": async event => {
        await requireMastoFeederAdmin(event);
        const formData = await event.request.formData();
        const canonicalInstanceUrl = formData.get("canonical_instance_url");
        if (typeof canonicalInstanceUrl !== "string" || !canonicalInstanceUrl) {
            return fail(400, {error: "Canonical instance URL is required"});
        }
        const validationResult = await validateMastoFeederUserTokens(
            event,
            canonicalInstanceUrl
        );
        return {
            message: `Validated ${validationResult.total} sessions for ${canonicalInstanceUrl}.`,
            validationResult,
        };
    },
};
