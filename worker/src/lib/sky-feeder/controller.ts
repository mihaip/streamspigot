import {
    error,
    redirect,
    type Cookies,
    type Redirect,
    type RequestEvent,
} from "@sveltejs/kit";
import {dev} from "$app/environment";
import {requestLocalLock} from "@atproto/oauth-client-node";
import {errorMessage, errorSummary, sanitizeLogString} from "$lib/feeder/log";
import {feedOutputResponse, jsonResponse} from "$lib/feeder/response";
import {resolveFeederPrefs} from "$lib/feeder/prefs";
import {searchFeedUrl, searchQueryError} from "$lib/feeder/search";
import {WorkerKV} from "$lib/kv";
import {SkyFeederKV} from "./kv";
import {FeedErrors, type FeedErrorKind} from "$lib/feeder/errors";
import {
    createSkyAgent,
    createSkyOAuthClient,
    hasSearchScope,
    OAUTH_SCOPE,
    parsePrivateJwk,
    skyClientMetadata,
    skyJwks,
} from "./oauth";
import {createSkyOAuthRequestLock} from "./oauth-lock";
import {renderSearchFeed, renderTimelineFeed} from "./feed";
import {renderTimelineErrorFeed, SKY_FEEDER_ERROR_PROVIDER} from "./errors";
import type {FeedOutputType, FeedOptions} from "$lib/status/feed";
import type {SkyFeederPrefs, SkyFeederSession} from "./types";

const SESSION_COOKIE_NAME = "skyfeeder-session";
const SESSION_COOKIE_OPTIONS = {
    path: "/sky-feeder",
};

let warnedAboutDevLocalLock = false;

type SkyFeederEnv = Env & {
    ATPROTO_OAUTH_PRIVATE_JWK?: string;
};

type SkyFeederProfile = {
    handle: string;
};

export class SkyFeederController {
    #kv: SkyFeederKV;
    #feedErrors: FeedErrors;
    #appProtocol: string;
    #appHost: string;
    #cookies: Cookies;
    #privateJwk: string | undefined;
    #oauthLockNamespace: DurableObjectNamespace | undefined;
    #executionContext: ExecutionContext | undefined;

    constructor(event: RequestEvent) {
        const {cookies, platform, url} = event;
        const env = platform?.env as SkyFeederEnv | undefined;
        const kv = WorkerKV.fromEvent(event);
        this.#kv = new SkyFeederKV(kv);
        this.#feedErrors = new FeedErrors(kv, SKY_FEEDER_ERROR_PROVIDER);
        this.#appProtocol = url.protocol;
        this.#appHost = url.host;
        this.#cookies = cookies;
        this.#privateJwk = env?.ATPROTO_OAUTH_PRIVATE_JWK;
        this.#oauthLockNamespace = env?.SKY_OAUTH_LOCK;
        this.#executionContext = platform?.ctx ?? platform?.context;
    }

    async getSession(): Promise<SkyFeederSession | null> {
        const sessionId = this.#cookies.get(SESSION_COOKIE_NAME);
        if (!sessionId) {
            return null;
        }
        return this.#kv.getSessionById(sessionId);
    }

    async getProfile(session: SkyFeederSession): Promise<SkyFeederProfile> {
        const agent = await this.#getAgent(session.did, "profile");
        const profile = await agent.getProfile({actor: session.did});
        return {handle: profile.data.handle};
    }

    async canSearch(session: SkyFeederSession): Promise<boolean> {
        return hasSearchScope(await this.#kv.getOAuthScopes(session.did));
    }

    async handleEnableSearch(): Promise<Redirect> {
        const session = await this.getSession();
        if (!session) {
            return redirect(302, "/sky-feeder");
        }
        return this.handleSignIn(session.did);
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
            const agentPromise = this.#getAgent(session.did, "feed");
            // Persist rotated single-use tokens even if the client disconnects.
            this.#executionContext?.waitUntil(agentPromise.catch(() => {}));
            const agent = await agentPromise;
            console.info("sky-feeder:feed-auth", {
                step: "restore:success",
                did: session.did,
                handle: session.handle,
                appHost: this.#appHost,
                appProtocol: this.#appProtocol,
            });
            const feed = await renderTimelineFeed(
                agent,
                session,
                this.timelineFeedUrl(session, options.output),
                this.#baseUrl(),
                {timeZone: prefs.timeZone},
                options
            );
            await this.#feedErrors.clear(session.feedId);
            return feedOutputResponse(feed);
        } catch (error) {
            const kind = isOAuthSessionUnavailable(error) ? "auth" : "error";
            return this.#feedErrors.respond({
                feedId: session.feedId,
                error,
                kind,
                options,
                logContext: {
                    did: session.did,
                    handle: session.handle,
                    appHost: this.#appHost,
                    appProtocol: this.#appProtocol,
                },
                renderErrorFeed: () =>
                    this.#renderTimelineErrorFeed(
                        session,
                        prefs,
                        options,
                        error,
                        kind
                    ),
            });
        }
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
        const validationError = searchQueryError(query);
        if (validationError) {
            return error(400, validationError);
        }
        if (!(await this.canSearch(session))) {
            return error(403, "Enable search from the Sky Feeder page first.");
        }

        const prefs = resolveFeederPrefs(session.prefs);
        try {
            const agentPromise = this.#getAgent(session.did, "search-feed");
            // Persist rotated single-use tokens even if the client disconnects.
            this.#executionContext?.waitUntil(agentPromise.catch(() => {}));
            const agent = await agentPromise;
            return feedOutputResponse(
                await renderSearchFeed(
                    agent,
                    query,
                    this.searchFeedUrl(session, query, options.output),
                    `${this.#baseUrl()}?${new URLSearchParams({q: query})}`,
                    {timeZone: prefs.timeZone},
                    options
                )
            );
        } catch (cause) {
            const details = errorSummary(cause);
            console.error("Sky Feeder search request failed", {
                message: errorMessage(cause),
            });
            if (
                isOAuthSessionUnavailable(cause) ||
                details.status === "401" ||
                details.status === "403"
            ) {
                return error(
                    403,
                    "Sign in again from the Sky Feeder page to restore search access."
                );
            }
            if (details.code === "BadQueryString" || details.status === "400") {
                return error(
                    400,
                    "Bluesky could not understand this search query."
                );
            }
            return new Response("Bluesky search is temporarily unavailable.", {
                status: 503,
                headers: {"Retry-After": "300"},
            });
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

    searchFeedBaseUrl(session: SkyFeederSession): string {
        return `${this.#baseUrl()}/feed/${session.feedId}/search`;
    }

    searchFeedUrl(
        session: SkyFeederSession,
        query: string,
        output?: FeedOutputType
    ): string {
        return searchFeedUrl(this.searchFeedBaseUrl(session), query, output);
    }

    async #getAgent(did: string, context: string) {
        return createSkyAgent(await this.#getOAuthClient(context), did);
    }

    async #getOAuthClient(context: string) {
        const requestLock = dev
            ? requestLocalLock
            : this.#oauthLockNamespace
              ? createSkyOAuthRequestLock(this.#oauthLockNamespace)
              : undefined;

        if (dev && !warnedAboutDevLocalLock) {
            warnedAboutDevLocalLock = true;
            console.warn("sky-feeder:oauth-lock", {
                step: "dev:local-lock",
                message:
                    "SvelteKit dev uses requestLocalLock; preview and deploy use the Durable Object lock.",
            });
        }

        if (!requestLock) {
            throw new Error("SKY_OAUTH_LOCK is not configured");
        }

        return createSkyOAuthClient({
            baseUrl: this.#baseUrl(),
            stateStore: this.#kv.oauthStateStore(),
            sessionStore: this.#kv.oauthSessionStore(context),
            privateJwk: parsePrivateJwk(this.#privateJwk),
            requestLock,
        });
    }

    #baseUrl(): string {
        return `${this.#appProtocol}//${this.#appHost}/sky-feeder`;
    }

    async #renderTimelineErrorFeed(
        session: SkyFeederSession,
        prefs: Required<SkyFeederPrefs>,
        options: FeedOptions,
        error: unknown,
        kind: FeedErrorKind
    ) {
        return renderTimelineErrorFeed({
            session,
            feedUrl: this.timelineFeedUrl(session, options.output),
            homeUrl: this.#baseUrl(),
            timeZone: prefs.timeZone,
            options,
            error,
            kind,
            oauth: await this.#oauthSessionHashMaterial(session.did),
        });
    }

    async #oauthSessionHashMaterial(did: string) {
        try {
            return await this.#kv.getOAuthSessionHashMaterial(did);
        } catch (error) {
            console.error("Sky Feeder OAuth diagnostics lookup failed", {
                did,
                message: errorMessage(error),
                error: errorSummary(error),
            });
            return null;
        }
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
