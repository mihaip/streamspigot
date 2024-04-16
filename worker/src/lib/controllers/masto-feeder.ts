import {APP_NAME} from "$lib/constants";
import {error, redirect, type Cookies, type Redirect} from "@sveltejs/kit";
import {createOAuthAPIClient, createRestAPIClient} from "masto";

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

    constructor(
        platform: Readonly<App.Platform> | undefined,
        appProtocol: string,
        appHost: string
    ) {
        const kv = platform?.env?.MASTOFEEDER;
        if (!kv) {
            throw new Error(
                "Could not find MASTOFEEDER KV namespace. Make sure you're running with wrangler"
            );
        }
        this.#kv = new MastoFeederKV(kv);
        this.#appProtocol = appProtocol;
        this.#appHost = appHost;
    }

    async getSession(cookies: Cookies): Promise<MastoFeederSession | null> {
        const sessionId = cookies.get(SESSION_COOKIE_NAME);
        if (!sessionId) {
            return null;
        }
        return this.#kv.getSessionById(sessionId);
    }

    async handleSignIn(
        instanceUrl: string,
        cookies: Cookies
    ): Promise<Redirect> {
        const app = await this.#getOrCreateApp(instanceUrl);
        const authRequest = await this.#createAuthRequest(instanceUrl);

        cookies.set(
            AUTH_REQUEST_COOKIE_NAME,
            authRequest.id,
            AUTH_REQUEST_COOKIE_OPTIONS
        );

        return redirect(302, this.#getAuthURL(app, authRequest));
    }

    async handleSignInCallback(
        code: string,
        state: string | null,
        cookies: Cookies
    ): Promise<Response> {
        const authRequestId = cookies.get(AUTH_REQUEST_COOKIE_NAME);
        if (!authRequestId) {
            return error(400, "No auth request cookie found");
        }
        cookies.delete(AUTH_REQUEST_COOKIE_NAME, AUTH_REQUEST_COOKIE_OPTIONS);

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
            redirectUri: this.#redirectUri(),
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

        cookies.set(
            SESSION_COOKIE_NAME,
            session.sessionId,
            SESSION_COOKIE_OPTIONS
        );

        return redirect(302, "/masto-feeder");
    }

    async #getOrCreateApp(instanceUrl: string): Promise<MastoFeederApp> {
        const existingApp = await this.#kv.getApp(instanceUrl);
        if (existingApp) {
            return existingApp;
        }

        const masto = createRestAPIClient({url: instanceUrl});

        const apiApp = await masto.v1.apps.create({
            clientName: `${APP_NAME} - Masto Feeder`,
            redirectUris: this.#redirectUri(),
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

    #getAuthURL(
        app: MastoFeederApp,
        authRequest: MastoFeederAuthRequest
    ): string {
        const url = new URL(app.instanceUrl);
        url.pathname = "/oauth/authorize";
        url.searchParams.set("client_id", app.clientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("redirect_uri", this.#redirectUri());
        url.searchParams.set("scope", SCOPES.join(" "));
        url.searchParams.set("force_login", "false");
        url.searchParams.set("state", authRequest.id);
        return url.toString();
    }

    #redirectUri(): string {
        return `${this.#appProtocol}//${this.#appHost}/masto-feeder/sign-in-callback`;
    }
}

export type MastoFeederApp = {
    instanceUrl: string;
    clientId: string;
    clientSecret: string;
};

export type MastoFeederAuthRequest = {
    id: string;
    instanceUrl: string;
};

export type MastoFeederSession = {
    sessionId: string;
    mastodonId: string;
    instanceUrl: string;
    feedId: string;
    accessToken: string;
};

class MastoFeederKV {
    #kv: KVNamespace;

    constructor(kv: KVNamespace) {
        this.#kv = kv;
    }

    async getApp(instanceUrl: string): Promise<MastoFeederApp | null> {
        return await this.#get(this.#appKey(instanceUrl));
    }

    async putApp(app: MastoFeederApp): Promise<void> {
        return await this.#put(this.#appKey(app.instanceUrl), app);
    }

    #appKey(instanceUrl: string): string {
        return `app:${instanceUrl}`;
    }

    async getAuthRequest(id: string): Promise<MastoFeederAuthRequest | null> {
        return await this.#get(this.#authRequestKey(id));
    }

    async putAuthRequest(authRequest: MastoFeederAuthRequest): Promise<void> {
        return await this.#put(
            this.#authRequestKey(authRequest.id),
            authRequest
        );
    }

    async deleteAuthRequest(id: string): Promise<void> {
        return await this.#kv.delete(this.#authRequestKey(id));
    }

    #authRequestKey(id: string): string {
        return `auth_request:${id}`;
    }

    async getSessionById(id: string): Promise<MastoFeederSession | null> {
        return this.#get(this.#sessionKey(id));
    }

    async getSessionByFeedId(
        feedId: string
    ): Promise<MastoFeederSession | null> {
        const sessionId = await this.#kv.get(this.#sessionFeedIdKey(feedId));
        if (!sessionId) {
            return null;
        }
        return await this.getSessionById(sessionId);
    }

    async getSessionByMastodonId(
        instanceUrl: string,
        mastodonId: string
    ): Promise<MastoFeederSession | null> {
        const sessionId = await this.#kv.get(
            this.#sessionMastodonIdKey(instanceUrl, mastodonId)
        );
        if (!sessionId) {
            return null;
        }
        return await this.getSessionById(sessionId);
    }

    async putSession(session: MastoFeederSession): Promise<void> {
        await this.#kv.put(
            this.#sessionFeedIdKey(session.feedId),
            session.sessionId
        );
        await this.#kv.put(
            this.#sessionMastodonIdKey(session.instanceUrl, session.mastodonId),
            session.sessionId
        );
        return await this.#put(this.#sessionKey(session.sessionId), session);
    }

    // We don't expose generic mutation methods so that we can know which
    // indexes we need to update.
    async updateSessionToken(
        session: MastoFeederSession,
        accessToken: string
    ): Promise<MastoFeederSession> {
        session.accessToken = accessToken;
        await this.#put(this.#sessionKey(session.sessionId), session);
        return session;
    }

    async updateSessionFeedId(
        session: MastoFeederSession,
        feedId: string
    ): Promise<MastoFeederSession> {
        await this.#kv.delete(this.#sessionFeedIdKey(session.feedId));
        session.feedId = feedId;
        await this.#put(this.#sessionKey(session.sessionId), session);
        await this.#put(this.#sessionFeedIdKey(feedId), session.sessionId);
        return session;
    }

    #sessionKey(id: string): string {
        return `session:${id}`;
    }

    #sessionFeedIdKey(id: string): string {
        return `seesion_feed_id:${id}`;
    }

    #sessionMastodonIdKey(instanceUrl: string, mastodonId: string) {
        return `session_mastodon_id:${btoa(instanceUrl)}:${mastodonId}`;
    }

    async #get<T>(key: string): Promise<T | null> {
        return await this.#kv.get<T>(key, {type: "json"});
    }

    async #put<T>(key: string, value: T): Promise<void> {
        return await this.#kv.put(key, JSON.stringify(value));
    }
}
