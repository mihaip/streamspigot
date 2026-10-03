import {
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
import {WorkerKV} from "$lib/kv";
import {SkyFeederKV, type SkyFeedErrorState} from "./kv";
import {
    createSkyAgent,
    createSkyOAuthClient,
    OAUTH_SCOPE,
    parsePrivateJwk,
    skyClientMetadata,
    skyJwks,
} from "./oauth";
import {createSkyOAuthRequestLock} from "./oauth-lock";
import {renderTimelineFeed} from "./feed";
import {
    renderTimelineErrorFeed,
    timelineErrorSignature,
    type SkyFeederTimelineErrorKind,
} from "./errors";
import type {FeedOutputType, FeedOptions} from "$lib/status/feed";
import type {SkyFeederPrefs, SkyFeederSession} from "./types";

const SESSION_COOKIE_NAME = "skyfeeder-session";
const SESSION_COOKIE_OPTIONS = {
    path: "/sky-feeder",
};
const GENERIC_ERROR_ITEM_THRESHOLD = 3;

let warnedAboutDevLocalLock = false;

type SkyFeederEnv = Env & {
    ATPROTO_OAUTH_PRIVATE_JWK?: string;
};

type SkyFeederProfile = {
    handle: string;
};

export class SkyFeederController {
    #kv: SkyFeederKV;
    #appProtocol: string;
    #appHost: string;
    #cookies: Cookies;
    #privateJwk: string | undefined;
    #oauthLockNamespace: DurableObjectNamespace | undefined;
    #executionContext: ExecutionContext | undefined;

    constructor(event: RequestEvent) {
        const {cookies, platform, url} = event;
        const env = platform?.env as SkyFeederEnv | undefined;
        this.#kv = new SkyFeederKV(WorkerKV.fromEvent(event));
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
            await this.#clearTimelineErrorState(session);
            return feedOutputResponse(feed);
        } catch (error) {
            if (isOAuthSessionUnavailable(error)) {
                const errorDetails = errorSummary(error);
                const errorState = await this.#recordTimelineErrorState(
                    session,
                    error,
                    "auth"
                );
                console.error("Sky Feeder feed authorization failed", {
                    did: session.did,
                    handle: session.handle,
                    appHost: this.#appHost,
                    appProtocol: this.#appProtocol,
                    message: errorMessage(error),
                    error: errorDetails,
                    errorState,
                });
                return feedOutputResponse(
                    await this.#renderTimelineErrorFeed(
                        session,
                        prefs,
                        options,
                        error,
                        "auth"
                    )
                );
            }
            const errorDetails = errorSummary(error);
            const errorState = await this.#recordTimelineErrorState(
                session,
                error,
                "error"
            );
            console.error("Sky Feeder feed failed", {
                did: session.did,
                handle: session.handle,
                appHost: this.#appHost,
                appProtocol: this.#appProtocol,
                message: errorMessage(error),
                error: errorDetails,
                errorState,
            });
            if (errorState.count < GENERIC_ERROR_ITEM_THRESHOLD) {
                return this.#transientTimelineErrorResponse(
                    errorState,
                    options
                );
            }
            return feedOutputResponse(
                await this.#renderTimelineErrorFeed(
                    session,
                    prefs,
                    options,
                    error,
                    "error"
                )
            );
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
        kind: SkyFeederTimelineErrorKind
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

    async #recordTimelineErrorState(
        session: SkyFeederSession,
        error: unknown,
        kind: SkyFeederTimelineErrorKind
    ): Promise<SkyFeedErrorState> {
        const now = new Date().toISOString();
        const message = errorMessage(error);
        const signature = await timelineErrorSignature(kind, error);
        try {
            return await this.#kv.putFeedErrorState(session.feedId, {
                kind,
                signature,
                message,
            });
        } catch (stateError) {
            console.error("Sky Feeder feed error state update failed", {
                did: session.did,
                handle: session.handle,
                feedId: session.feedId,
                message: errorMessage(stateError),
                error: errorSummary(stateError),
            });
            return {
                kind,
                signature,
                count: 1,
                firstSeenAt: now,
                lastSeenAt: now,
                lastMessage: message,
            };
        }
    }

    async #clearTimelineErrorState(session: SkyFeederSession): Promise<void> {
        try {
            await this.#kv.clearFeedErrorState(session.feedId);
        } catch (error) {
            console.error("Sky Feeder feed error state clear failed", {
                did: session.did,
                handle: session.handle,
                feedId: session.feedId,
                message: errorMessage(error),
                error: errorSummary(error),
            });
        }
    }

    #transientTimelineErrorResponse(
        state: SkyFeedErrorState,
        options: FeedOptions
    ): Response {
        const message =
            "Sky Feeder could not update this feed. The error looks transient, so no feed item was generated yet.";
        const headers = new Headers({
            "Retry-After": "300",
        });
        if (options.output === "json") {
            return jsonResponse(
                {
                    message,
                    error: {
                        kind: state.kind,
                        count: state.count,
                        threshold: GENERIC_ERROR_ITEM_THRESHOLD,
                        firstSeenAt: state.firstSeenAt,
                        lastSeenAt: state.lastSeenAt,
                    },
                },
                {status: 503, headers}
            );
        }

        return new Response(message, {status: 503, headers});
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
