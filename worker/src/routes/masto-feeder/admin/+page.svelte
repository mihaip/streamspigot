<script lang="ts">
    import {enhance} from "$app/forms";
    import {resolve} from "$app/paths";
    import Layout from "$lib/components/Layout.svelte";
    import type {SubmitFunction} from "@sveltejs/kit";
    import type {ActionData, PageData} from "./$types";

    let {data, form}: {data: PageData; form: ActionData} = $props();

    type AdminOverview = PageData["overview"];
    type ValidationResult = NonNullable<ActionData>["validationResult"];

    let overviewOverride = $state<AdminOverview | undefined>();
    let localActionMessage = $state<string | undefined>();
    let localActionError = $state<string | undefined>();
    let localValidationResult = $state<ValidationResult>();
    let pendingAction = $state<string | null>(null);

    let overview = $derived(overviewOverride ?? data.overview);
    let missingAppRecordCount = $derived(
        overview.groups.reduce(
            (count, group) =>
                count +
                group.apps.filter(app => !app.appRecordFetchedAt).length,
            0
        )
    );
    let actionMessage = $derived(
        pendingAction ? undefined : (localActionMessage ?? form?.message)
    );
    let actionError = $derived(
        pendingAction ? undefined : (localActionError ?? form?.error)
    );
    let validationResult = $derived(
        localValidationResult ?? form?.validationResult
    );

    const formatList = (values?: string[] | null) =>
        values && values.length ? values.join(", ") : "unknown";

    const formatValue = (value?: string | null) => value || "unknown";

    const permissionLabel = (status: "ready" | "missing" | "unknown") =>
        ({
            ready: "Search permission granted",
            missing: "Needs search authorization",
            unknown: "Scopes unknown",
        })[status];

    const registrationLabel = (status: "ready" | "missing" | "unknown") =>
        ({
            ready: "Ready for search sign-ins",
            missing: "Replacement on next sign-in",
            unknown: "Scopes unknown; replacement on next sign-in",
        })[status];

    const enhanceAdminForm: SubmitFunction = ({action, formData, cancel}) => {
        if (
            action.search.includes("delete-app-record") ||
            action.search.includes("canonicalize-app-record")
        ) {
            const instanceUrl = formData.get("instance_url");
            const actionDescription = action.search.includes(
                "canonicalize-app-record"
            )
                ? `Canonicalize ${instanceUrl} and update any sessions that use that exact stored instance URL?`
                : `Delete the local app record for ${instanceUrl} and any sessions that use that exact stored instance URL? This does not delete the remote Mastodon app registration.`;
            if (!confirm(actionDescription)) {
                cancel();
                return;
            }
        }

        pendingAction = pendingActionKey(action, formData);
        localActionMessage = undefined;
        localActionError = undefined;

        return async ({result, update}) => {
            if (result.type === "success" || result.type === "failure") {
                const resultData = result.data as ActionData;
                localActionMessage = resultData?.message;
                localActionError = resultData?.error;
                if (result.type === "success") {
                    if (resultData?.overview) {
                        overviewOverride = resultData.overview;
                    }
                    if (
                        resultData?.deletedAppKey ||
                        resultData?.canonicalizedAppKey
                    ) {
                        localValidationResult = undefined;
                    }
                    if (resultData?.validationResult) {
                        localValidationResult = resultData.validationResult;
                    }
                }
            }

            await update({reset: false, invalidateAll: false});
            pendingAction = null;
        };
    };

    function pendingActionKey(action: URL, formData: FormData): string {
        if (action.search.includes("load-app-record")) {
            return `app:${formData.get("instance_url") ?? ""}`;
        }
        if (action.search.includes("load-missing-app-records")) {
            return "bulk-load-app-records";
        }
        if (action.search.includes("delete-app-record")) {
            return `delete:${formData.get("instance_url") ?? ""}`;
        }
        if (action.search.includes("canonicalize-app-record")) {
            return `canonicalize:${formData.get("instance_url") ?? ""}`;
        }
        if (action.search.includes("validate-user-tokens")) {
            return `tokens:${formData.get("canonical_instance_url") ?? ""}`;
        }
        return action.toString();
    }
</script>

<Layout title="Masto Feeder Admin">
    {#snippet intro()}
        <p>
            KV-driven audit of Masto Feeder app registrations and stored user
            sessions. Remote Mastodon checks only run when triggered below.
        </p>
    {/snippet}

    <div class="admin-page">
        <div class="summary">
            <div>
                <b>{overview.appCount}</b>
                app records
            </div>
            <div>
                <b>{overview.sessionCount}</b>
                sessions
            </div>
            <div>
                <b>{overview.problemGroupCount}</b>
                groups flagged
            </div>
        </div>

        <div class="summary">
            <div>
                <b>{overview.searchPermissions.ready}</b>sessions with search
                permission
            </div>
            <div>
                <b>{overview.searchPermissions.missing}</b>sessions needing
                search authorization
            </div>
            <div>
                <b>{overview.searchPermissions.unknown}</b>sessions with unknown
                scopes
            </div>
        </div>
        <p class="migration-note">
            On the next sign-in, registrations missing required scopes (or with
            unknown scopes) are replaced automatically. Old remote registrations
            and user tokens remain active. Each user enables search through
            <a href={resolve("/masto-feeder")}>Search feeds</a>; their
            existing feed URLs and preferences are preserved.
        </p>
        <p class="migration-note">
            Session counts use scopes saved at authorization, not a live search
            check. Unknown scopes need reauthorization to be recorded. The
            cached client belongs to future sign-ins; sessions may still use
            older registrations on the same server. Deleting an app and its
            sessions breaks those feeds and is not required for upgrading
            scopes.
        </p>

        <form
            class="bulk-actions"
            action="?/load-missing-app-records"
            method="POST"
            use:enhance={enhanceAdminForm}>
            <button
                disabled={missingAppRecordCount === 0 ||
                    pendingAction === "bulk-load-app-records"}>
                {pendingAction === "bulk-load-app-records"
                    ? "Loading missing app metadata..."
                    : `Load missing app metadata (${missingAppRecordCount})`}
            </button>
        </form>

        {#if actionMessage}
            <p class="message">{actionMessage}</p>
        {/if}

        {#if actionError}
            <p class="error">{actionError}</p>
        {/if}

        <div class="groups">
            {#each overview.groups as group (group.canonicalInstanceUrl)}
                <section class:problem={group.isProblem}>
                    <div class="group-header">
                        <div>
                            <h2>{group.canonicalInstanceUrl}</h2>
                            <div class="meta">
                                {group.appCount} app{group.appCount === 1
                                    ? ""
                                    : "s"},
                                {group.sessionCount} session{group.sessionCount ===
                                1
                                    ? ""
                                    : "s"}
                            </div>
                            <div class="meta">
                                Search permissions: {group.searchPermissions
                                    .ready} granted,
                                {group.searchPermissions.missing} need authorization,
                                {group.searchPermissions.unknown} unknown
                            </div>
                            {#if group.problems.length}
                                <div class="problems">
                                    {group.problems.join(", ")}
                                </div>
                            {/if}
                        </div>
                        <form
                            action="?/validate-user-tokens"
                            method="POST"
                            use:enhance={enhanceAdminForm}>
                            <input
                                type="hidden"
                                name="canonical_instance_url"
                                value={group.canonicalInstanceUrl} />
                            <button
                                disabled={pendingAction ===
                                    `tokens:${group.canonicalInstanceUrl}`}>
                                {pendingAction ===
                                `tokens:${group.canonicalInstanceUrl}`
                                    ? "Validating..."
                                    : "Validate tokens"}
                            </button>
                        </form>
                    </div>

                    {#if validationResult?.canonicalInstanceUrl === group.canonicalInstanceUrl}
                        <div class="validation">
                            <h3>Token validation</h3>
                            <p>
                                Checked {validationResult.total} sessions:
                                {validationResult.valid} valid,
                                {validationResult.invalid} invalid,
                                {validationResult.errored} errored.
                            </p>
                            {#if validationResult.groups.length}
                                {#each validationResult.groups as validationGroup (`${validationGroup.storedInstanceUrl}:${validationGroup.clientIdPrefixes.join(",")}`)}
                                    <div class="validation-group">
                                        <h4>
                                            {validationGroup.storedInstanceUrl}
                                        </h4>
                                        <div class="meta">
                                            Cached client (future sign-ins):
                                            {validationGroup.clientIdPrefixes
                                                .length
                                                ? validationGroup.clientIdPrefixes.join(
                                                      ", "
                                                  )
                                                : "no matching app record"}
                                            · {validationGroup.valid} valid,
                                            {validationGroup.invalid} invalid,
                                            {validationGroup.errored} errored
                                        </div>
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Session</th>
                                                    <th>Feed</th>
                                                    <th>Status</th>
                                                    <th>Search permission</th>
                                                    <th>Granted scopes</th>
                                                    <th>Account</th>
                                                    <th>Message</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {#each validationGroup.results as result (`${result.sessionIdPrefix}:${result.feedIdPrefix}`)}
                                                    <tr
                                                        class:error-row={result.status !==
                                                            "valid"}>
                                                        <td
                                                            >{result.sessionIdPrefix}</td>
                                                        <td
                                                            >{result.feedIdPrefix}</td>
                                                        <td>{result.status}</td>
                                                        <td
                                                            >{permissionLabel(
                                                                result.searchPermission
                                                            )}</td>
                                                        <td
                                                            >{formatList(
                                                                result.grantedScopes
                                                            )}</td>
                                                        <td
                                                            >{result.account ??
                                                                ""}</td>
                                                        <td
                                                            >{result.message ??
                                                                ""}</td>
                                                    </tr>
                                                {/each}
                                            </tbody>
                                        </table>
                                    </div>
                                {/each}
                            {/if}
                        </div>
                    {/if}

                    <div class="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Stored instance</th>
                                    <th>Stored sessions</th>
                                    <th>Client</th>
                                    <th>Redirect URI</th>
                                    <th>Registered scopes / upgrade</th>
                                    <th>Fetched</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each group.apps as app (app.key)}
                                    <tr>
                                        <td>
                                            <div>{app.instanceUrl}</div>
                                            {#if app.hasCanonicalDifference}
                                                <div class="flag">
                                                    non-canonical
                                                </div>
                                            {/if}
                                            {#if app.hasHostnameCaseDifference}
                                                <div class="flag">
                                                    hostname case
                                                </div>
                                            {/if}
                                        </td>
                                        <td
                                            >{app.storedInstanceSessionCount}</td>
                                        <td>{app.clientIdPrefix}</td>
                                        <td>
                                            <div>
                                                {formatList(
                                                    app.registeredRedirectUris
                                                )}
                                            </div>
                                            {#if app.registeredRedirectUri}
                                                <div class="legacy">
                                                    legacy:
                                                    {app.registeredRedirectUri}
                                                </div>
                                            {/if}
                                            {#if app.appRecordFetchRedirectUriUsed}
                                                <div class="legacy">
                                                    token:
                                                    {app.appRecordFetchRedirectUriUsed}
                                                </div>
                                            {/if}
                                            {#if app.appRecordFetchError}
                                                <div class="error-text">
                                                    {app.appRecordFetchError}
                                                </div>
                                            {/if}
                                        </td>
                                        <td>
                                            <div>
                                                {formatList(
                                                    app.registeredScopes
                                                )}
                                            </div>
                                            <div class="meta">
                                                {registrationLabel(
                                                    app.scopeStatus
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div>
                                                {formatValue(
                                                    app.appRecordFetchedAt
                                                )}
                                            </div>
                                            {#if app.registeredName}
                                                <div class="legacy">
                                                    {app.registeredName}
                                                </div>
                                            {/if}
                                            {#if app.registeredWebsite}
                                                <div class="legacy">
                                                    {app.registeredWebsite}
                                                </div>
                                            {/if}
                                        </td>
                                        <td>
                                            <form
                                                action="?/load-app-record"
                                                method="POST"
                                                use:enhance={enhanceAdminForm}>
                                                <input
                                                    type="hidden"
                                                    name="instance_url"
                                                    value={app.instanceUrl} />
                                                <button
                                                    disabled={pendingAction ===
                                                        `app:${app.instanceUrl}`}>
                                                    {pendingAction ===
                                                    `app:${app.instanceUrl}`
                                                        ? "Loading..."
                                                        : "Load app"}
                                                </button>
                                            </form>
                                            {#if group.appCount === 1 && app.hasCanonicalDifference}
                                                <form
                                                    action="?/canonicalize-app-record"
                                                    method="POST"
                                                    use:enhance={enhanceAdminForm}>
                                                    <input
                                                        type="hidden"
                                                        name="instance_url"
                                                        value={app.instanceUrl} />
                                                    <button
                                                        class="secondary-button"
                                                        disabled={pendingAction ===
                                                            `canonicalize:${app.instanceUrl}`}>
                                                        {pendingAction ===
                                                        `canonicalize:${app.instanceUrl}`
                                                            ? "Canonicalizing..."
                                                            : "Canonicalize"}
                                                    </button>
                                                </form>
                                            {/if}
                                            <form
                                                action="?/delete-app-record"
                                                method="POST"
                                                use:enhance={enhanceAdminForm}>
                                                <input
                                                    type="hidden"
                                                    name="instance_url"
                                                    value={app.instanceUrl} />
                                                <button
                                                    class="delete-button"
                                                    disabled={pendingAction ===
                                                        `delete:${app.instanceUrl}`}>
                                                    {pendingAction ===
                                                    `delete:${app.instanceUrl}`
                                                        ? "Deleting..."
                                                        : app.storedInstanceSessionCount >
                                                            0
                                                          ? "Delete app + sessions"
                                                          : "Delete app"}
                                                </button>
                                            </form>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </section>
            {/each}
        </div>
    </div>
</Layout>

<style>
    :global(.container:has(.admin-page)) {
        max-width: min(96vw, 1400px);
    }

    .summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.75em;
        margin-bottom: 1em;
    }

    .summary > div,
    section {
        background: #f6f6f6;
        border: 1px solid #00000033;
        padding: 1em;
    }

    .summary b {
        display: block;
        font-size: 1.6em;
    }

    .bulk-actions {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 1em;
    }

    .message {
        background: #eef8e8;
        border: 1px solid #2db30066;
        padding: 0.75em;
    }

    .error {
        background: #fdd;
        padding: 0.75em;
    }

    .groups {
        display: flex;
        flex-direction: column;
        gap: 1em;
    }

    section.problem {
        border-color: #c77000;
    }

    .group-header {
        display: flex;
        justify-content: space-between;
        gap: 1em;
        margin-bottom: 1em;
    }

    h2 {
        font-size: 1.2em;
        margin: 0 0 0.25em;
    }

    .meta,
    .legacy {
        color: #666;
        font-size: 0.9em;
    }

    .problems,
    .flag {
        color: #9a5200;
        font-size: 0.9em;
    }

    .table-wrapper {
        overflow-x: auto;
    }

    table {
        border-collapse: collapse;
        width: 100%;
        min-width: 900px;
    }

    th,
    td {
        border-top: 1px solid #00000022;
        padding: 0.5em;
        text-align: left;
        vertical-align: top;
    }

    th {
        background: #ececec;
    }

    button {
        white-space: nowrap;
    }

    .secondary-button,
    .delete-button {
        margin-top: 0.5em;
    }

    .error-text,
    .error-row {
        color: #900;
    }

    .validation {
        margin-bottom: 1em;
        background: #eef3ff;
        border: 1px solid #00000022;
        padding: 1em;
    }

    .validation h3,
    .validation h4 {
        margin: 0 0 0.4em;
    }

    .validation-group {
        margin-top: 1em;
    }

    .validation table {
        min-width: 0;
        margin-top: 0.5em;
    }

    @media (max-width: 500px) {
        .summary {
            grid-template-columns: 1fr;
        }

        .group-header {
            flex-direction: column;
        }
    }
</style>
