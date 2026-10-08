import {APP_NAME} from "$lib/constants";
import {
    error,
    redirect,
    type Cookies,
    type Redirect,
    type RequestEvent,
} from "@sveltejs/kit";
import {createOAuthAPIClient, createRestAPIClient} from "$lib/masto";
import {errorMessage, sanitizeLogString} from "$lib/feeder/log";
import {MastoFeederKV} from "./kv";
import {WorkerKV} from "../kv";
import {
    type MastoFeederSession,
    type MastoFeederApp,
    type MastoFeederAuthRequest,
    type MastoFeederPrefs,
} from "./types";
import type {FeedOptions, FeedOutputType} from "$lib/status/feed";
import {renderSearchFeed, renderTimelineFeed} from "./feed";
import {feedOutputResponse} from "$lib/feeder/response";
import {DEFAULT_TIME_ZONE} from "$lib/feeder/prefs";
import {searchFeedUrl, searchQueryError} from "$lib/feeder/search";
import {
    MASTO_FEEDER_SCOPES as SCOPES,
    appScopeStatus,
    hasSearchScope,
} from "./oauth-scopes";
import type {MastodonAdapterEnv} from "./status-adapter";
import {MastoHttpError} from "masto";

const AUTH_REQUEST_COOKIE_NAME = "mastofeeder-auth-request";
const AUTH_REQUEST_COOKIE_OPTIONS = {
    path: "/masto-feeder",
};

const SESSION_COOKIE_NAME = "mastofeeder-session";
const SESSION_COOKIE_OPTIONS = {
    path: "/masto-feeder",
};

export class MastoFeederController {
    #kv: MastoFeederKV;
    #appProtocol: string;
    #appHost: string;
    #cookies: Cookies;

    constructor(event: RequestEvent) {
        const {cookies, url} = event;
        this.#kv = new MastoFeederKV(WorkerKV.fromEvent(event));
        this.#appProtocol = url.protocol;
        this.#appHost = url.host;
        this.#cookies = cookies;
    }

    async getSession(): Promise<MastoFeederSession | null> {
        const sessionId = this.#cookies.get(SESSION_COOKIE_NAME);
        if (!sessionId) {
            return null;
        }
        return this.#kv.getSessionById(sessionId);
    }

    async handleSignIn(instanceUrl: string): Promise<Redirect> {
        let app: MastoFeederApp;
        let authRequest: MastoFeederAuthRequest;
        try {
            app = await this.#getOrCreateApp(instanceUrl);
            authRequest = await this.#createAuthRequest(app);
        } catch (error) {
            console.error("Masto Feeder sign-in failed", {
                instanceUrl: sanitizeLogString(instanceUrl),
                message: errorMessage(error),
            });
            throw error;
        }

        this.#cookies.set(
            AUTH_REQUEST_COOKIE_NAME,
            authRequest.id,
            AUTH_REQUEST_COOKIE_OPTIONS
        );

        return redirect(302, this.#getAuthUrl(app, authRequest));
    }

    async handleSignInCallback(
        code: string,
        state: string | null
    ): Promise<Response> {
        const authRequestId = this.#cookies.get(AUTH_REQUEST_COOKIE_NAME);
        if (!authRequestId) {
            return error(400, "No auth request cookie found");
        }
        this.#cookies.delete(
            AUTH_REQUEST_COOKIE_NAME,
            AUTH_REQUEST_COOKIE_OPTIONS
        );

        // Sky Bridge does not send back the state parameter.
        if (state && state != authRequestId) {
            return error(
                400,
                `Mismatched auth request cookie (${authRequestId}) and state (${state})`
            );
        }

        const authRequest = await this.#kv.getAuthRequest(authRequestId);
        if (!authRequest) {
            return error(400, `Unknown auth request (${authRequestId})`);
        }
        const {instanceUrl} = authRequest;
        await this.#kv.deleteAuthRequest(authRequestId);

        // An app registration can be replaced while this authorization is pending.
        const app = authRequest.app ?? (await this.#kv.getApp(instanceUrl));
        if (!app) {
            return error(400, `Unknown app ${instanceUrl}`);
        }

        try {
            const oauthMasto = createOAuthAPIClient({url: instanceUrl});

            const {accessToken, scope} = await oauthMasto.token.create({
                grantType: "authorization_code",
                clientId: app.clientId,
                clientSecret: app.clientSecret,
                redirectUri: this.#redirectUrl(),
                scope: SCOPES.join(" "),
                code,
            });
            const scopes = scope?.split(/\s+/).filter(Boolean);

            const apiMasto = createRestAPIClient({
                url: instanceUrl,
                accessToken,
            });

            const credentials = await apiMasto.v1.accounts.verifyCredentials();
            const mastodonId = credentials.id;

            let session = await this.#kv.getSessionByMastodonId(
                instanceUrl,
                mastodonId
            );
            if (session) {
                session = await this.#kv.updateSessionToken(
                    session,
                    accessToken,
                    scopes
                );
            } else {
                session = {
                    sessionId: crypto.randomUUID(),
                    feedId: crypto.randomUUID(),
                    mastodonId,
                    instanceUrl,
                    accessToken,
                    scopes,
                };
                await this.#kv.putSession(session);
            }

            this.#cookies.set(
                SESSION_COOKIE_NAME,
                session.sessionId,
                SESSION_COOKIE_OPTIONS
            );
        } catch (error) {
            console.error("Masto Feeder sign-in callback failed", {
                instanceUrl: sanitizeLogString(instanceUrl),
                message: errorMessage(error),
            });
            throw error;
        }

        return redirect(303, "/masto-feeder");
    }

    async handleSignOut(): Promise<Redirect> {
        const session = await this.getSession();
        if (session) {
            this.#cookies.delete(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS);
        }
        return redirect(302, "/masto-feeder");
    }

    async handleResetFeedId(): Promise<Redirect> {
        const session = await this.getSession();
        if (!session) {
            return redirect(302, "/masto-feeder");
        }

        const feedId = crypto.randomUUID();
        await this.#kv.updateSessionFeedId(session, feedId);

        return redirect(302, "/masto-feeder");
    }

    async handleUpdatePrefs(prefs: MastoFeederPrefs): Promise<Redirect> {
        const session = await this.getSession();
        if (!session) {
            return redirect(302, "/masto-feeder");
        }

        await this.#kv.updateSessionPrefs(session, prefs);
        return redirect(302, "/masto-feeder");
    }

    async handleStatusParent(
        feedId: string,
        statusId: string
    ): Promise<Response> {
        const session = await this.#kv.getSessionByFeedId(feedId);
        if (!session) {
            return error(404, "Unknown feed ID");
        }

        const masto = createRestAPIClient({
            url: session.instanceUrl,
            accessToken: session.accessToken,
        });

        const context = await masto.v1.statuses
            .$select(statusId)
            .context.fetch();
        const {ancestors} = context;
        if (ancestors.length === 0) {
            return error(404, "No ancestors found");
        }
        const parent = ancestors[ancestors.length - 1];
        if (!parent.url) {
            return error(404, "Ancestor has no URL");
        }
        return redirect(302, parent.url);
    }

    async handleTimelineFeed(
        feedId: string,
        options: FeedOptions
    ): Promise<Response> {
        const session = await this.#kv.getSessionByFeedId(feedId);
        if (!session) {
            return error(404, "Unknown feed ID");
        }
        return feedOutputResponse(
            await renderTimelineFeed(
                session,
                this.timelineFeedUrl(session, options.output),
                this.#baseUrl(),
                this.#adapterEnv(session),
                options
            )
        );
    }

    async handleSearchFeed(
        feedId: string,
        query: string,
        options: FeedOptions
    ): Promise<Response> {
        const session = await this.#kv.getSessionByFeedId(feedId);
        if (!session) {
            return error(404, "Unknown feed ID");
        }
        this.#validateSearch(session, query);
        try {
            return feedOutputResponse(
                await renderSearchFeed(
                    session,
                    query,
                    this.searchFeedUrl(session, query, options.output),
                    `${this.#baseUrl()}?${new URLSearchParams({q: query})}`,
                    this.#adapterEnv(session),
                    options
                )
            );
        } catch (cause) {
            rethrowSearchError(cause);
        }
    }

    #validateSearch(session: MastoFeederSession, query: string): void {
        const validationError = searchQueryError(query);
        if (validationError) {
            error(400, validationError);
        }
        if (!hasSearchScope(session.scopes)) {
            error(403, "Enable search from the Masto Feeder page first.");
        }
    }

    #adapterEnv(session: MastoFeederSession): MastodonAdapterEnv {
        const prefs = resolvePrefs(session.prefs);
        return {
            instanceUrl: session.instanceUrl,
            timeZone: prefs.timeZone,
            useLocalUrls: prefs.useLocalUrls,
            statusParentUrlGenerator: this.statusParentUrl.bind(this, session),
            youtubeEmbedUrlGenerator: this.youtubeEmbedUrl.bind(this, session),
        };
    }

    async #getOrCreateApp(instanceUrl: string): Promise<MastoFeederApp> {
        const existingApp = await this.#kv.getApp(instanceUrl);
        if (
            existingApp &&
            appScopeStatus(existingApp.registeredScopes) === "ready"
        ) {
            return existingApp;
        }

        const masto = createRestAPIClient({url: instanceUrl});

        const apiApp = await masto.v1.apps.create({
            clientName: `${APP_NAME} - Masto Feeder`,
            redirectUris: this.#redirectUrl(),
            scopes: SCOPES.join(" "),
        });

        if (!apiApp.clientId || !apiApp.clientSecret) {
            throw new Error(
                "Could not register app - returned value was missing client information"
            );
        }

        const app: MastoFeederApp = {
            instanceUrl,
            clientId: apiApp.clientId,
            clientSecret: apiApp.clientSecret,
            registeredScopes: apiApp.scopes ?? SCOPES,
        };
        await this.#kv.putApp(app);
        return app;
    }

    async #createAuthRequest(
        app: MastoFeederApp
    ): Promise<MastoFeederAuthRequest> {
        const authRequest: MastoFeederAuthRequest = {
            id: crypto.randomUUID(),
            instanceUrl: app.instanceUrl,
            app: {clientId: app.clientId, clientSecret: app.clientSecret},
        };
        await this.#kv.putAuthRequest(authRequest);
        return authRequest;
    }

    #getAuthUrl(
        app: MastoFeederApp,
        authRequest: MastoFeederAuthRequest
    ): string {
        const url = new URL(app.instanceUrl);
        url.pathname = "/oauth/authorize";
        url.searchParams.set("client_id", app.clientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("redirect_uri", this.#redirectUrl());
        url.searchParams.set("scope", SCOPES.join(" "));
        url.searchParams.set("force_login", "false");
        url.searchParams.set("state", authRequest.id);
        return url.toString();
    }

    timelineFeedUrl(
        session: MastoFeederSession,
        output?: FeedOutputType
    ): string {
        const url = new URL(
            `${this.#baseUrl()}/feed/${session.feedId}/timeline`
        );
        if (output && output !== "atom") {
            url.searchParams.set("output", output);
        }
        return url.toString();
    }

    searchFeedUrl(
        session: MastoFeederSession,
        query: string,
        output?: FeedOutputType
    ): string {
        return searchFeedUrl(
            `${this.#baseUrl()}/feed/${session.feedId}/search`,
            query,
            output
        );
    }

    statusParentUrl(session: MastoFeederSession, statusId: string): string {
        return `${this.#baseUrl()}/feed/${session.feedId}/parent/${statusId}`;
    }

    youtubeEmbedUrl(session: MastoFeederSession, videoId: string): string {
        return `${this.#baseUrl()}/feed/${session.feedId}/youtube/${videoId}`;
    }

    #redirectUrl(): string {
        return `${this.#baseUrl()}/sign-in-callback`;
    }

    #baseUrl(): string {
        return `${this.#appProtocol}//${this.#appHost}/masto-feeder`;
    }
}

export function resolvePrefs(
    prefs: MastoFeederPrefs | undefined
): Required<MastoFeederPrefs> {
    return {
        timeZone: prefs?.timeZone ?? DEFAULT_TIME_ZONE,
        useLocalUrls: prefs?.useLocalUrls ?? false,
    };
}

function rethrowSearchError(cause: unknown): never {
    if (cause instanceof MastoHttpError) {
        if (cause.statusCode === 401 || cause.statusCode === 403) {
            error(
                403,
                "Your instance denied search access. Enable search again to reauthorize."
            );
        }
        if (cause.statusCode === 400 || cause.statusCode === 422) {
            error(
                400,
                "Mastodon rejected this search query. Check its syntax."
            );
        }
    }
    console.warn("Masto Feeder search request failed", {
        message: errorMessage(cause),
    });
    error(502, "Could not search your instance. Please try again later.");
}
