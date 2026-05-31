import {error, redirect, type RequestEvent} from "@sveltejs/kit";
import {createRestAPIClient} from "$lib/masto";
import {errorMessage} from "$lib/feeder/log";
import {MastoFeederController} from "./controller";
import {MastoFeederKV} from "./kv";
import {WorkerKV} from "../kv";
import type {MastoFeederApp, MastoFeederSession} from "./types";

const ADMIN_INSTANCE_URL = "https://hachyderm.io";
const ADMIN_USERNAME = "mihaip";
const ADMIN_ACCT = `${ADMIN_USERNAME}@hachyderm.io`;
const MASTO_FEEDER_SCOPES = [
    "read:accounts",
    "read:follows",
    "read:lists",
    "read:statuses",
];
const APP_RECORD_REDIRECT_URI_CANDIDATES = [
    "https://www.streamspigot.com/masto-feeder/sign-in-callback",
    "https://streamspigot.com/masto-feeder/sign-in-callback",
];
const USER_AGENT = "Masto-Feeder; (+https://www.streamspigot.com/masto-feeder)";

export type MastoFeederAdminOverview = {
    appCount: number;
    sessionCount: number;
    problemGroupCount: number;
    groups: MastoFeederAdminAppGroup[];
};

export type MastoFeederAdminAppGroup = {
    canonicalInstanceUrl: string;
    appCount: number;
    sessionCount: number;
    isProblem: boolean;
    problems: string[];
    apps: MastoFeederAdminAppRecord[];
};

export type MastoFeederAdminAppRecord = {
    key: string;
    instanceUrl: string;
    clientIdPrefix: string;
    storedInstanceSessionCount: number;
    hasCanonicalDifference: boolean;
    hasHostnameCaseDifference: boolean;
    registeredRedirectUris?: string[];
    registeredRedirectUri?: string | null;
    registeredScopes?: string[];
    registeredName?: string | null;
    registeredWebsite?: string | null;
    appRecordFetchedAt?: string;
    appRecordFetchRedirectUriUsed?: string | null;
    appRecordFetchError?: string;
};

export type MastoFeederAdminTokenValidation = {
    canonicalInstanceUrl: string;
    checkedAt: string;
    total: number;
    valid: number;
    invalid: number;
    errored: number;
    groups: MastoFeederAdminTokenValidationGroup[];
    results: MastoFeederAdminTokenValidationResult[];
};

export type MastoFeederAdminTokenValidationGroup = {
    storedInstanceUrl: string;
    clientIdPrefixes: string[];
    total: number;
    valid: number;
    invalid: number;
    errored: number;
    results: MastoFeederAdminTokenValidationResult[];
};

export type MastoFeederAdminTokenValidationResult = {
    sessionIdPrefix: string;
    feedIdPrefix: string;
    storedInstanceUrl: string;
    status: "valid" | "invalid" | "error";
    account?: string;
    message?: string;
};

type AppRecordFetchResult = {
    message: string;
    appRecord: MastoFeederAdminAppRecord;
};

type AppRecordBulkFetchResult = {
    message: string;
    appRecords: MastoFeederAdminAppRecord[];
};

type AppRecordDeleteResult =
    | {
          message: string;
          deletedAppKey: string;
          deletedSessionCount: number;
      }
    | {
          error: string;
      };

type AppRecordCanonicalizeResult =
    | {
          message: string;
          canonicalizedAppKey: string;
          appRecord: MastoFeederAdminAppRecord;
          updatedSessionCount: number;
      }
    | {
          error: string;
      };

type TokenResponse = {
    access_token?: unknown;
    accessToken?: unknown;
};

type AppVerifyResponse = {
    redirect_uri?: unknown;
    redirect_uris?: unknown;
    redirectUri?: unknown;
    redirectUris?: unknown;
    scopes?: unknown;
    scope?: unknown;
    name?: unknown;
    website?: unknown;
};

type AccountVerifyResponse = {
    username?: unknown;
    acct?: unknown;
};

class AdminFetchError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.status = status;
    }
}

export async function requireMastoFeederAdmin(
    event: RequestEvent
): Promise<MastoFeederSession> {
    const controller = new MastoFeederController(event);
    const session = await controller.getSession();
    if (!session) {
        redirect(302, "/masto-feeder");
    }

    const masto = createRestAPIClient({
        url: session.instanceUrl,
        accessToken: session.accessToken,
    });
    const credentials = await masto.v1.accounts.verifyCredentials();

    const instanceUrl = canonicalMastodonInstanceUrl(session.instanceUrl);
    const username = credentials.username.toLowerCase();
    const acct = credentials.acct.toLowerCase();

    if (
        instanceUrl !== ADMIN_INSTANCE_URL ||
        (username !== ADMIN_USERNAME && acct !== ADMIN_ACCT)
    ) {
        console.warn("Masto Feeder admin access denied", {
            instanceUrl,
            username,
            acct,
        });
        error(404, "Not found");
    }

    return session;
}

export async function loadMastoFeederAdminOverview(
    event: RequestEvent
): Promise<MastoFeederAdminOverview> {
    const kv = new MastoFeederKV(WorkerKV.fromEvent(event));
    const [appRecords, sessionRecords] = await Promise.all([
        kv.listApps(),
        kv.listSessions(),
    ]);
    const sessionCounts = new Map<string, number>();
    for (const {value: session} of sessionRecords) {
        const canonicalInstanceUrl = canonicalMastodonInstanceUrl(
            session.instanceUrl
        );
        sessionCounts.set(
            canonicalInstanceUrl,
            (sessionCounts.get(canonicalInstanceUrl) ?? 0) + 1
        );
    }
    const storedInstanceSessionCounts = new Map<string, number>();
    for (const {value: session} of sessionRecords) {
        storedInstanceSessionCounts.set(
            session.instanceUrl,
            (storedInstanceSessionCounts.get(session.instanceUrl) ?? 0) + 1
        );
    }

    const groups = new Map<string, MastoFeederAdminAppGroup>();
    for (const {key, value: app} of appRecords) {
        const canonicalInstanceUrl = canonicalMastodonInstanceUrl(
            app.instanceUrl
        );
        let group = groups.get(canonicalInstanceUrl);
        if (!group) {
            group = {
                canonicalInstanceUrl,
                appCount: 0,
                sessionCount: sessionCounts.get(canonicalInstanceUrl) ?? 0,
                isProblem: false,
                problems: [],
                apps: [],
            };
            groups.set(canonicalInstanceUrl, group);
        }
        group.apps.push(
            sanitizeAppRecord(
                key,
                app,
                canonicalInstanceUrl,
                storedInstanceSessionCounts.get(app.instanceUrl) ?? 0
            )
        );
        group.appCount = group.apps.length;
    }

    const sortedGroups = [...groups.values()]
        .map(group => {
            group.apps.sort((a, b) =>
                a.instanceUrl.localeCompare(b.instanceUrl)
            );
            group.problems = appGroupProblems(group);
            group.isProblem = group.problems.length > 0;
            return group;
        })
        .sort((a, b) => {
            if (a.isProblem !== b.isProblem) {
                return a.isProblem ? -1 : 1;
            }
            return a.canonicalInstanceUrl.localeCompare(b.canonicalInstanceUrl);
        });

    return {
        appCount: appRecords.length,
        sessionCount: sessionRecords.length,
        problemGroupCount: sortedGroups.filter(group => group.isProblem).length,
        groups: sortedGroups,
    };
}

export async function loadMastoFeederAppRecord(
    event: RequestEvent,
    instanceUrl: string
): Promise<AppRecordFetchResult> {
    const kv = new MastoFeederKV(WorkerKV.fromEvent(event));
    const app = await kv.getApp(instanceUrl);
    if (!app) {
        error(404, "Unknown app record");
    }

    return await loadMastoFeederAppRecordFromApp(kv, event.url, app);
}

export async function loadMissingMastoFeederAppRecords(
    event: RequestEvent
): Promise<AppRecordBulkFetchResult> {
    const kv = new MastoFeederKV(WorkerKV.fromEvent(event));
    const apps = (await kv.listApps())
        .map(record => record.value)
        .filter(app => !app.appRecordFetchedAt);

    const appRecords: MastoFeederAdminAppRecord[] = [];
    let loaded = 0;
    let failed = 0;
    await forEachWithConcurrency(apps, 4, async app => {
        const result = await loadMastoFeederAppRecordFromApp(
            kv,
            event.url,
            app
        );
        appRecords.push(result.appRecord);
        if (result.appRecord.appRecordFetchError) {
            failed++;
        } else {
            loaded++;
        }
    });

    return {
        message: `Loaded metadata for ${loaded} apps; ${failed} failed.`,
        appRecords,
    };
}

export async function deleteMastoFeederAppRecord(
    event: RequestEvent,
    instanceUrl: string
): Promise<AppRecordDeleteResult> {
    const kv = new MastoFeederKV(WorkerKV.fromEvent(event));
    const app = await kv.getApp(instanceUrl);
    if (!app) {
        error(404, "Unknown app record");
    }

    const sessions = (await kv.listSessions())
        .map(record => record.value)
        .filter(session => session.instanceUrl === instanceUrl);

    await Promise.all(sessions.map(session => kv.deleteSession(session)));
    await kv.deleteApp(instanceUrl);
    return {
        message: `Deleted local app record for ${instanceUrl} and ${sessions.length} sessions.`,
        deletedAppKey: appKey(app),
        deletedSessionCount: sessions.length,
    };
}

export async function canonicalizeMastoFeederAppRecord(
    event: RequestEvent,
    instanceUrl: string
): Promise<AppRecordCanonicalizeResult> {
    const kv = new MastoFeederKV(WorkerKV.fromEvent(event));
    const app = await kv.getApp(instanceUrl);
    if (!app) {
        error(404, "Unknown app record");
    }

    const canonicalInstanceUrl = canonicalMastodonInstanceUrl(instanceUrl);
    if (instanceUrl === canonicalInstanceUrl) {
        return {error: `${instanceUrl} is already canonical.`};
    }

    const existingCanonicalApp = await kv.getApp(canonicalInstanceUrl);
    if (existingCanonicalApp) {
        return {
            error: `Refusing to canonicalize ${instanceUrl}; ${canonicalInstanceUrl} already has an app record.`,
        };
    }

    const canonicalGroupApps = (await kv.listApps()).filter(
        record =>
            canonicalMastodonInstanceUrl(record.value.instanceUrl) ===
            canonicalInstanceUrl
    );
    if (canonicalGroupApps.length !== 1) {
        return {
            error: `Refusing to canonicalize ${instanceUrl}; canonical group has ${canonicalGroupApps.length} app records.`,
        };
    }

    const sessions = (await kv.listSessions())
        .map(record => record.value)
        .filter(session => session.instanceUrl === instanceUrl);
    for (const session of sessions) {
        await kv.updateSessionInstanceUrl(session, canonicalInstanceUrl);
    }

    const updatedApp: MastoFeederApp = {
        ...app,
        instanceUrl: canonicalInstanceUrl,
    };
    await kv.putApp(updatedApp);
    await kv.deleteApp(instanceUrl);

    return {
        message: `Canonicalized ${instanceUrl} to ${canonicalInstanceUrl} and updated ${sessions.length} sessions.`,
        canonicalizedAppKey: appKey(app),
        appRecord: sanitizeAppRecord(
            appKey(updatedApp),
            updatedApp,
            canonicalInstanceUrl,
            sessions.length
        ),
        updatedSessionCount: sessions.length,
    };
}

async function loadMastoFeederAppRecordFromApp(
    kv: MastoFeederKV,
    url: URL,
    app: MastoFeederApp
): Promise<AppRecordFetchResult> {
    const checkedAt = new Date().toISOString();
    try {
        const {accessToken, redirectUriUsed} = await mintAppAccessToken(
            app,
            tokenScopeCandidates(app),
            tokenRedirectUriCandidates(url)
        );
        const appRecord = await verifyAppCredentials(app, accessToken);
        const updatedApp: MastoFeederApp = {
            ...app,
            registeredRedirectUris: appRecord.registeredRedirectUris,
            registeredRedirectUri: appRecord.registeredRedirectUri,
            registeredScopes: appRecord.registeredScopes,
            registeredName: appRecord.registeredName,
            registeredWebsite: appRecord.registeredWebsite,
            appRecordFetchedAt: checkedAt,
            appRecordFetchRedirectUriUsed: redirectUriUsed,
            appRecordFetchError: undefined,
        };
        await kv.putApp(updatedApp);
        return {
            message: `Loaded app metadata for ${app.instanceUrl}.`,
            appRecord: sanitizeAppRecord(appKey(updatedApp), updatedApp),
        };
    } catch (error) {
        const updatedApp: MastoFeederApp = {
            ...app,
            appRecordFetchedAt: checkedAt,
            appRecordFetchError: sanitizeError(error),
        };
        await kv.putApp(updatedApp);
        return {
            message: `Could not load app metadata for ${app.instanceUrl}: ${updatedApp.appRecordFetchError}`,
            appRecord: sanitizeAppRecord(appKey(updatedApp), updatedApp),
        };
    }
}

export async function validateMastoFeederUserTokens(
    event: RequestEvent,
    canonicalInstanceUrl: string
): Promise<MastoFeederAdminTokenValidation> {
    const kv = new MastoFeederKV(WorkerKV.fromEvent(event));
    const [apps, sessions] = await Promise.all([
        kv.listApps(),
        kv.listSessions(),
    ]);
    const clientIdsByStoredInstanceUrl = new Map<string, string[]>();
    for (const {value: app} of apps) {
        if (
            canonicalMastodonInstanceUrl(app.instanceUrl) !==
            canonicalInstanceUrl
        ) {
            continue;
        }
        const clientIds =
            clientIdsByStoredInstanceUrl.get(app.instanceUrl) ?? [];
        clientIds.push(prefix(app.clientId));
        clientIdsByStoredInstanceUrl.set(app.instanceUrl, clientIds);
    }

    const matchingSessions = sessions
        .map(record => record.value)
        .filter(
            session =>
                canonicalMastodonInstanceUrl(session.instanceUrl) ===
                canonicalInstanceUrl
        );

    const results: MastoFeederAdminTokenValidationResult[] = [];
    for (const session of matchingSessions) {
        results.push(await validateSessionToken(session));
    }
    const groups = tokenValidationGroups(results, clientIdsByStoredInstanceUrl);

    return {
        canonicalInstanceUrl,
        checkedAt: new Date().toISOString(),
        total: results.length,
        valid: results.filter(result => result.status === "valid").length,
        invalid: results.filter(result => result.status === "invalid").length,
        errored: results.filter(result => result.status === "error").length,
        groups,
        results,
    };
}

export function canonicalMastodonInstanceUrl(instanceUrl: string): string {
    try {
        const url = new URL(instanceUrl);
        return `https://${url.hostname.toLowerCase()}`;
    } catch {
        return instanceUrl.trim().toLowerCase();
    }
}

function sanitizeAppRecord(
    key: string,
    app: MastoFeederApp,
    canonicalInstanceUrl = canonicalMastodonInstanceUrl(app.instanceUrl),
    storedInstanceSessionCount = 0
): MastoFeederAdminAppRecord {
    return {
        key,
        instanceUrl: app.instanceUrl,
        clientIdPrefix: prefix(app.clientId),
        storedInstanceSessionCount,
        hasCanonicalDifference: app.instanceUrl !== canonicalInstanceUrl,
        hasHostnameCaseDifference: hostnameHasUppercase(app.instanceUrl),
        registeredRedirectUris: app.registeredRedirectUris,
        registeredRedirectUri: app.registeredRedirectUri,
        registeredScopes: app.registeredScopes,
        registeredName: app.registeredName,
        registeredWebsite: app.registeredWebsite,
        appRecordFetchedAt: app.appRecordFetchedAt,
        appRecordFetchRedirectUriUsed: app.appRecordFetchRedirectUriUsed,
        appRecordFetchError: app.appRecordFetchError,
    };
}

function appKey(app: MastoFeederApp): string {
    return `app:${app.instanceUrl}`;
}

function appGroupProblems(group: MastoFeederAdminAppGroup): string[] {
    const problems: string[] = [];
    if (group.apps.length > 1) {
        problems.push("duplicate app variants");
    }
    if (group.apps.some(app => app.hasCanonicalDifference)) {
        problems.push("non-canonical stored instance URL");
    }
    if (group.apps.some(app => app.hasHostnameCaseDifference)) {
        problems.push("hostname case variant");
    }
    if (group.apps.some(app => !app.appRecordFetchedAt)) {
        problems.push("missing cached app metadata");
    }
    if (group.apps.some(app => app.appRecordFetchError)) {
        problems.push("app metadata fetch error");
    }
    return problems;
}

function tokenValidationGroups(
    results: MastoFeederAdminTokenValidationResult[],
    clientIdsByStoredInstanceUrl: Map<string, string[]>
): MastoFeederAdminTokenValidationGroup[] {
    const groups = new Map<string, MastoFeederAdminTokenValidationResult[]>();
    for (const result of results) {
        const group = groups.get(result.storedInstanceUrl) ?? [];
        group.push(result);
        groups.set(result.storedInstanceUrl, group);
    }
    return [...groups.entries()]
        .map(([storedInstanceUrl, results]) => ({
            storedInstanceUrl,
            clientIdPrefixes:
                clientIdsByStoredInstanceUrl.get(storedInstanceUrl) ?? [],
            total: results.length,
            valid: results.filter(result => result.status === "valid").length,
            invalid: results.filter(result => result.status === "invalid")
                .length,
            errored: results.filter(result => result.status === "error").length,
            results,
        }))
        .sort((a, b) => a.storedInstanceUrl.localeCompare(b.storedInstanceUrl));
}

async function mintAppAccessToken(
    app: MastoFeederApp,
    scopeCandidates: (string | null)[],
    redirectUriCandidates: (string | null)[]
): Promise<{accessToken: string; redirectUriUsed: string | null}> {
    const errors: string[] = [];
    for (const scope of scopeCandidates) {
        for (const redirectUri of redirectUriCandidates) {
            try {
                const accessToken = await mintAppAccessTokenWithRedirectUri(
                    app,
                    scope,
                    redirectUri
                );
                return {accessToken, redirectUriUsed: redirectUri};
            } catch (error) {
                errors.push(
                    `${scope ?? "no scope"}, ${
                        redirectUri ?? "no redirect_uri"
                    }: ${sanitizeError(error)}`
                );
            }
        }
    }
    throw new Error(`Could not mint app token (${errors.join("; ")})`);
}

async function mintAppAccessTokenWithRedirectUri(
    app: MastoFeederApp,
    scope: string | null,
    redirectUri: string | null
): Promise<string> {
    const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: app.clientId,
        client_secret: app.clientSecret,
    });
    if (scope) {
        body.set("scope", scope);
    }
    if (redirectUri) {
        body.set("redirect_uri", redirectUri);
    }

    const response = await fetch(new URL("/oauth/token", app.instanceUrl), {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
        },
        body,
    });
    if (!response.ok) {
        throw new AdminFetchError(
            await responseErrorMessage(response),
            response.status
        );
    }

    const token = await responseJSON<TokenResponse>(response, "Token response");
    const accessToken =
        getString(token.access_token) ?? getString(token.accessToken);
    if (!accessToken) {
        throw new Error("Token response did not include an access token");
    }
    return accessToken;
}

async function verifyAppCredentials(
    app: MastoFeederApp,
    accessToken: string
): Promise<
    Pick<
        MastoFeederApp,
        | "registeredRedirectUris"
        | "registeredRedirectUri"
        | "registeredScopes"
        | "registeredName"
        | "registeredWebsite"
    >
> {
    const response = await fetch(
        new URL("/api/v1/apps/verify_credentials", app.instanceUrl),
        {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "User-Agent": USER_AGENT,
            },
        }
    );
    if (!response.ok) {
        throw new AdminFetchError(
            await responseErrorMessage(response),
            response.status
        );
    }

    const appRecord = await responseJSON<AppVerifyResponse>(
        response,
        "App credentials response"
    );
    const registeredRedirectUri =
        getString(appRecord.redirect_uri) ?? getString(appRecord.redirectUri);
    return {
        registeredRedirectUris:
            getStringArray(appRecord.redirect_uris) ??
            getStringArray(appRecord.redirectUris) ??
            splitWhitespaceString(registeredRedirectUri),
        registeredRedirectUri: registeredRedirectUri ?? null,
        registeredScopes:
            getStringArray(appRecord.scopes) ??
            splitWhitespaceString(getString(appRecord.scope)) ??
            splitWhitespaceString(getString(appRecord.scopes)),
        registeredName: getString(appRecord.name),
        registeredWebsite: getString(appRecord.website),
    };
}

async function validateSessionToken(
    session: MastoFeederSession
): Promise<MastoFeederAdminTokenValidationResult> {
    const baseResult = {
        sessionIdPrefix: prefix(session.sessionId),
        feedIdPrefix: prefix(session.feedId),
        storedInstanceUrl: session.instanceUrl,
    };
    try {
        const response = await fetch(
            new URL("/api/v1/accounts/verify_credentials", session.instanceUrl),
            {
                headers: {
                    "Authorization": `Bearer ${session.accessToken}`,
                    "User-Agent": USER_AGENT,
                },
            }
        );
        if (response.ok) {
            const account = await responseJSON<AccountVerifyResponse>(
                response,
                "Account credentials response"
            );
            return {
                ...baseResult,
                status: "valid",
                account:
                    getString(account.acct) ??
                    getString(account.username) ??
                    undefined,
            };
        }
        if (response.status === 401 || response.status === 403) {
            return {
                ...baseResult,
                status: "invalid",
                message: await responseErrorMessage(response),
            };
        }
        return {
            ...baseResult,
            status: "error",
            message: await responseErrorMessage(response),
        };
    } catch (error) {
        return {
            ...baseResult,
            status: "error",
            message: sanitizeError(error),
        };
    }
}

function tokenRedirectUriCandidates(url: URL): (string | null)[] {
    return dedupe([
        null,
        ...APP_RECORD_REDIRECT_URI_CANDIDATES,
        `${url.protocol}//${url.host}/masto-feeder/sign-in-callback`,
    ]);
}

function tokenScopeCandidates(app: MastoFeederApp): (string | null)[] {
    return dedupe([
        app.registeredScopes?.join(" ") ?? null,
        MASTO_FEEDER_SCOPES.join(" "),
        "read",
        null,
    ]);
}

function dedupe<T>(values: T[]): T[] {
    const result: T[] = [];
    for (const value of values) {
        if (!result.includes(value)) {
            result.push(value);
        }
    }
    return result;
}

async function forEachWithConcurrency<T>(
    values: T[],
    concurrency: number,
    callback: (value: T) => Promise<void>
): Promise<void> {
    let index = 0;
    const workers = Array.from(
        {length: Math.min(concurrency, values.length)},
        async () => {
            while (index < values.length) {
                const value = values[index++];
                await callback(value);
            }
        }
    );
    await Promise.all(workers);
}

function hostnameHasUppercase(instanceUrl: string): boolean {
    try {
        const match = instanceUrl.match(/^https?:\/\/([^/?#]+)/);
        return !!match?.[1] && /[A-Z]/.test(match[1]);
    } catch {
        return /[A-Z]/.test(instanceUrl);
    }
}

function prefix(value: string, length = 8): string {
    return value.slice(0, length);
}

function getString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function getStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const strings = value.filter(item => typeof item === "string");
    return strings.length === value.length ? strings : undefined;
}

function splitWhitespaceString(
    value: string | undefined
): string[] | undefined {
    if (!value) {
        return undefined;
    }
    return value.split(/\s+/).filter(Boolean);
}

async function responseErrorMessage(response: Response): Promise<string> {
    const body = await safeResponseBody(response);
    return body ? body.replace(/\s+/g, " ").trim().slice(0, 500) : "failed";
}

async function responseJSON<T>(response: Response, label: string): Promise<T> {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        throw new AdminFetchError(
            `${label} was ${contentType || "unknown content type"}: ${await safeResponseBody(response)}`,
            response.status
        );
    }
    return (await response.json()) as T;
}

async function safeResponseBody(response: Response): Promise<string> {
    const contentType = response.headers.get("content-type") ?? "";
    try {
        if (contentType.includes("application/json")) {
            const body = (await response.json()) as {
                error?: unknown;
                error_description?: unknown;
            };
            return [getString(body.error), getString(body.error_description)]
                .filter(Boolean)
                .join(": ");
        }
        const text = await response.text();
        const title = text.match(/<title>([^<]+)/i)?.[1];
        const heading = text.match(/<h1[^>]*>([^<]+)/i)?.[1];
        return [title, heading].filter(Boolean).join(": ") || text;
    } catch {
        return "";
    }
}

function sanitizeError(error: unknown): string {
    const status = error instanceof AdminFetchError ? `${error.status}: ` : "";
    const message = errorMessage(error).replace(/\s+/g, " ").trim();
    return `${status}${message}`.slice(0, 500);
}
