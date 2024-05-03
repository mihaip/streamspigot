import {APP_NAME} from "$lib/constants";
import {
    error,
    redirect,
    type Cookies,
    type Redirect,
    type RequestEvent,
} from "@sveltejs/kit";
import {createOAuthAPIClient, createRestAPIClient} from "$lib/masto";
import {MastoFeederKV} from "./kv";
import {WorkerKV} from "../kv";
import type {
    MastoFeederSession,
    MastoFeederApp,
    MastoFeederAuthRequest,
} from "./types";
import {renderTimelineFeed, type FeedOptions} from "./feed";

const SCOPES = ["read:accounts", "read:follows", "read:lists", "read:statuses"];

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
        const {cookies, platform, url} = event;
        const kv = platform?.env?.MASTOFEEDER;
        if (!kv) {
            throw new Error(
                "Could not find MASTOFEEDER KV namespace. Make sure you're running with wrangler"
            );
        }
        this.#kv = new MastoFeederKV(new WorkerKV(kv));
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
        const app = await this.#getOrCreateApp(instanceUrl);
        const authRequest = await this.#createAuthRequest(instanceUrl);

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

        const app = await this.#kv.getApp(instanceUrl);
        if (!app) {
            return error(400, `Unknown app ${instanceUrl}`);
        }

        const oauthMasto = createOAuthAPIClient({url: instanceUrl});

        const {accessToken} = await oauthMasto.token.create({
            grantType: "authorization_code",
            clientId: app.clientId,
            clientSecret: app.clientSecret,
            redirectUri: this.#redirectUrl(),
            scope: SCOPES.join(" "),
            code,
        });

        const apiMasto = createRestAPIClient({url: instanceUrl, accessToken});

        const credentials = await apiMasto.v1.accounts.verifyCredentials();
        const mastodonId = credentials.id;

        let session = await this.#kv.getSessionByMastodonId(
            instanceUrl,
            mastodonId
        );
        if (session) {
            session = await this.#kv.updateSessionToken(session, accessToken);
        } else {
            session = {
                sessionId: crypto.randomUUID(),
                feedId: crypto.randomUUID(),
                mastodonId,
                instanceUrl,
                accessToken,
            };
            await this.#kv.putSession(session);
        }

        this.#cookies.set(
            SESSION_COOKIE_NAME,
            session.sessionId,
            SESSION_COOKIE_OPTIONS
        );

        return redirect(302, "/masto-feeder");
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
        const {body, contentType} = await renderTimelineFeed(
            session,
            this.timelineFeedUrl(session),
            this.#baseUrl(),
            this.statusParentUrl.bind(this, session),
            options
        );
        const encodedBody = new TextEncoder().encode(body);
        return new Response(encodedBody, {
            headers: {
                "Content-Type": `${contentType}; charset=utf-8`,
            },
        });
    }

    async #getOrCreateApp(instanceUrl: string): Promise<MastoFeederApp> {
        const existingApp = await this.#kv.getApp(instanceUrl);
        if (existingApp) {
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
        };
        await this.#kv.putApp(app);
        return app;
    }

    async #createAuthRequest(
        instanceUrl: string
    ): Promise<MastoFeederAuthRequest> {
        const authRequest: MastoFeederAuthRequest = {
            id: crypto.randomUUID(),
            instanceUrl,
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

    timelineFeedUrl(session: MastoFeederSession): string {
        return `${this.#baseUrl()}/feed/${session.feedId}/timeline`;
    }

    statusParentUrl(session: MastoFeederSession, statusId: string): string {
        return `${this.#baseUrl()}/feed/${session.feedId}/parent/${statusId}`;
    }

    #redirectUrl(): string {
        return `${this.#baseUrl()}/sign-in-callback`;
    }

    #baseUrl(): string {
        return `${this.#appProtocol}//${this.#appHost}/masto-feeder`;
    }
}
