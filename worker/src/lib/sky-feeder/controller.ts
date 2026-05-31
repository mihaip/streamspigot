import {
    redirect,
    type Cookies,
    type Redirect,
    type RequestEvent,
} from "@sveltejs/kit";
import {errorMessage, errorSummary, sanitizeLogString} from "$lib/feeder/log";
import {feedOutputResponse, jsonResponse} from "$lib/feeder/response";
import {resolveFeederPrefs} from "$lib/feeder/prefs";
import {WorkerKV} from "$lib/kv";
import {SkyFeederKV} from "./kv";
import {
    createSkyAgent,
    createSkyOAuthClient,
    OAUTH_SCOPE,
    parsePrivateJwk,
    skyClientMetadata,
    skyJwks,
} from "./oauth";
import {renderTimelineFeed} from "./feed";
import type {FeedOutputType, FeedOptions} from "$lib/status/feed";
import type {SkyFeederPrefs, SkyFeederSession} from "./types";

const SESSION_COOKIE_NAME = "skyfeeder-session";
const SESSION_COOKIE_OPTIONS = {
    path: "/sky-feeder",
};

export class SkyFeederController {
    #kv: SkyFeederKV;
    #appProtocol: string;
    #appHost: string;
    #cookies: Cookies;
    #privateJwk: string | undefined;

    constructor(event: RequestEvent) {
        const {cookies, platform, url} = event;
        this.#kv = new SkyFeederKV(WorkerKV.fromEvent(event));
        this.#appProtocol = url.protocol;
        this.#appHost = url.host;
        this.#cookies = cookies;
        this.#privateJwk = (
            platform?.env as {ATPROTO_OAUTH_PRIVATE_JWK?: string} | undefined
        )?.ATPROTO_OAUTH_PRIVATE_JWK;
    }

    async getSession(): Promise<SkyFeederSession | null> {
        const sessionId = this.#cookies.get(SESSION_COOKIE_NAME);
        if (!sessionId) {
            return null;
        }
        return this.#kv.getSessionById(sessionId);
    }

    async getProfile(session: SkyFeederSession) {
        const agent = await this.#getAgent(session.did, "profile");
        const profile = await agent.getProfile({actor: session.did});
        return profile.data;
    }

    async handleSignIn(handle: string): Promise<Redirect> {
        let authUrl: URL;
        try {
            const oauthClient = await this.#getOAuthClient("sign-in");
            authUrl = await oauthClient.authorize(handle, {
                scope: OAUTH_SCOPE,
                state: crypto.randomUUID(),
            });
        } catch (error) {
            console.error("Sky Feeder sign-in failed", {
                handle,
                message: errorMessage(error),
            });
            throw error;
        }

        return redirect(302, authUrl);
    }

    async handleSignInCallback(params: URLSearchParams): Promise<Response> {
        const oauthClient = await this.#getOAuthClient("callback");
        let did: string;
        try {
            const {session: oauthSession} = await oauthClient.callback(params);
            did = oauthSession.did;
        } catch (error) {
            console.error("Sky Feeder sign-in callback failed", {
                oauthError: sanitizeLogString(params.get("error")),
                message: errorMessage(error),
            });
            return redirect(302, "/sky-feeder?auth_error=sign_in_failed");
        }

        try {
            const agent = await createSkyAgent(oauthClient, did);
            const profile = await agent.getProfile({actor: did});
            const handle = profile.data.handle;

            let session = await this.#kv.getSessionByDid(did);
            if (session) {
                session = await this.#kv.updateSessionProfile(session, handle);
            } else {
                session = {
                    sessionId: crypto.randomUUID(),
                    feedId: crypto.randomUUID(),
                    did,
                    handle,
                };
                await this.#kv.putSession(session);
            }

            this.#cookies.set(
                SESSION_COOKIE_NAME,
                session.sessionId,
                SESSION_COOKIE_OPTIONS
            );
        } catch (error) {
            console.error("Sky Feeder sign-in session setup failed", {
                message: errorMessage(error),
            });
            throw error;
        }

        return redirect(302, "/sky-feeder");
    }

    async handleSignOut(): Promise<Redirect> {
        this.clearSessionCookie();
        return redirect(302, "/sky-feeder");
    }

    clearSessionCookie(): void {
        this.#cookies.delete(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS);
    }

    async handleResetFeedId(): Promise<Redirect> {
        const session = await this.getSession();
        if (!session) {
            return redirect(302, "/sky-feeder");
        }

        await this.#kv.updateSessionFeedId(session, crypto.randomUUID());
        return redirect(302, "/sky-feeder");
    }

    async handleUpdatePrefs(prefs: SkyFeederPrefs): Promise<Redirect> {
        const session = await this.getSession();
        if (!session) {
            return redirect(302, "/sky-feeder");
        }

        await this.#kv.updateSessionPrefs(session, prefs);
        return redirect(302, "/sky-feeder");
    }

    async handleTimelineFeed(
        feedId: string,
        options: FeedOptions
    ): Promise<Response> {
        const session = await this.#kv.getSessionByFeedId(feedId);
        if (!session) {
            return new Response("Unknown feed ID", {status: 404});
        }

        const prefs = resolveFeederPrefs(session.prefs);
        try {
            console.info("sky-feeder:feed-auth", {
                step: "restore:start",
                did: session.did,
                handle: session.handle,
                appHost: this.#appHost,
                appProtocol: this.#appProtocol,
            });
            const agent = await this.#getAgent(session.did, "feed");
            console.info("sky-feeder:feed-auth", {
                step: "restore:success",
                did: session.did,
                handle: session.handle,
                appHost: this.#appHost,
                appProtocol: this.#appProtocol,
            });
            return feedOutputResponse(
                await renderTimelineFeed(
                    agent,
                    session,
                    this.timelineFeedUrl(session, options.output),
                    this.#baseUrl(),
                    {timeZone: prefs.timeZone},
                    options
                )
            );
        } catch (error) {
            if (isOAuthSessionUnavailable(error)) {
                const message =
                    "Sky Feeder authorization expired. Sign in again at /sky-feeder to restore this feed URL.";
                console.error("Sky Feeder feed authorization failed", {
                    did: session.did,
                    handle: session.handle,
                    appHost: this.#appHost,
                    appProtocol: this.#appProtocol,
                    message: errorMessage(error),
                    error: errorSummary(error),
                });
                return options.output === "json"
                    ? jsonResponse({message}, {status: 401})
                    : new Response(message, {status: 401});
            }
            throw error;
        }
    }

    async handleOAuthClientMetadata(): Promise<Response> {
        return jsonResponse(skyClientMetadata(this.#baseUrl()));
    }

    async handleJwks(): Promise<Response> {
        return jsonResponse(await skyJwks(parsePrivateJwk(this.#privateJwk)));
    }

    timelineFeedUrl(
        session: SkyFeederSession,
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

    async #getAgent(did: string, context: string) {
        return createSkyAgent(await this.#getOAuthClient(context), did);
    }

    async #getOAuthClient(context: string) {
        return createSkyOAuthClient({
            baseUrl: this.#baseUrl(),
            stateStore: this.#kv.oauthStateStore(),
            sessionStore: this.#kv.oauthSessionStore(context),
            privateJwk: parsePrivateJwk(this.#privateJwk),
        });
    }

    #baseUrl(): string {
        return `${this.#appProtocol}//${this.#appHost}/sky-feeder`;
    }
}

export function resolvePrefs(
    prefs: SkyFeederPrefs | undefined
): Required<SkyFeederPrefs> {
    return resolveFeederPrefs(prefs);
}

export function isOAuthSessionUnavailable(error: unknown): boolean {
    const message = errorMessage(error);
    return (
        message === "The session was deleted by another process" ||
        message === "The session was revoked" ||
        message === "Invalid refresh token" ||
        message === "No refresh token available" ||
        message === "Token was not issued to this client"
    );
}
