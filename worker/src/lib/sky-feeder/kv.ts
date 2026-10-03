import type {KV} from "$lib/kv";
import type {
    NodeSavedSession,
    NodeSavedState,
} from "@atproto/oauth-client-node";
import type {SkyFeederPrefs, SkyFeederSession} from "./types";

const PREFIX = "sky-feeder";
const OAUTH_STATE_TTL_SECONDS = 60 * 60;
const OAUTH_TOKEN_FINGERPRINT_BYTES = 12;
const FEED_ERROR_STATE_TTL_SECONDS = 30 * 24 * 60 * 60;

export class SkyFeederKV {
    #kv: KV;

    constructor(kv: KV) {
        this.#kv = kv;
    }

    async getSessionById(id: string): Promise<SkyFeederSession | null> {
        return this.#kv.getJSON(this.#sessionKey(id));
    }

    async getSessionByFeedId(feedId: string): Promise<SkyFeederSession | null> {
        const sessionId = await this.#kv.get(this.#sessionFeedIdKey(feedId));
        if (!sessionId) {
            return null;
        }
        return await this.getSessionById(sessionId);
    }

    async getSessionByDid(did: string): Promise<SkyFeederSession | null> {
        const sessionId = await this.#kv.get(this.#sessionDidKey(did));
        if (!sessionId) {
            return null;
        }
        return await this.getSessionById(sessionId);
    }

    async putSession(session: SkyFeederSession): Promise<void> {
        await this.#kv.put(
            this.#sessionFeedIdKey(session.feedId),
            session.sessionId
        );
        await this.#kv.put(this.#sessionDidKey(session.did), session.sessionId);
        await this.#kv.putJSON(this.#sessionKey(session.sessionId), session);
    }

    async updateSessionProfile(
        session: SkyFeederSession,
        handle: string
    ): Promise<SkyFeederSession> {
        session.handle = handle;
        await this.#kv.putJSON(this.#sessionKey(session.sessionId), session);
        return session;
    }

    async updateSessionFeedId(
        session: SkyFeederSession,
        feedId: string
    ): Promise<SkyFeederSession> {
        await this.#kv.delete(this.#sessionFeedIdKey(session.feedId));
        session.feedId = feedId;
        await this.#kv.putJSON(this.#sessionKey(session.sessionId), session);
        await this.#kv.put(this.#sessionFeedIdKey(feedId), session.sessionId);
        return session;
    }

    async updateSessionPrefs(
        session: SkyFeederSession,
        prefs: SkyFeederPrefs
    ): Promise<SkyFeederSession> {
        session.prefs = prefs;
        await this.#kv.putJSON(this.#sessionKey(session.sessionId), session);
        return session;
    }

    async putFeedErrorState(
        feedId: string,
        event: SkyFeedErrorEvent
    ): Promise<SkyFeedErrorState> {
        const previous = await this.#kv.getJSON<SkyFeedErrorState>(
            this.#feedErrorStateKey(feedId)
        );
        const now = new Date().toISOString();
        const matches =
            previous?.kind === event.kind &&
            previous.signature === event.signature;
        const state: SkyFeedErrorState = {
            kind: event.kind,
            signature: event.signature,
            count: matches ? previous.count + 1 : 1,
            firstSeenAt: matches ? previous.firstSeenAt : now,
            lastSeenAt: now,
            lastMessage: event.message,
        };
        await this.#kv.putJSON(this.#feedErrorStateKey(feedId), state, {
            expirationTtl: FEED_ERROR_STATE_TTL_SECONDS,
        });
        return state;
    }

    async clearFeedErrorState(feedId: string): Promise<void> {
        await this.#kv.delete(this.#feedErrorStateKey(feedId));
    }

    oauthStateStore() {
        return {
            set: async (key: string, value: NodeSavedState): Promise<void> => {
                await this.#kv.putJSON(this.#oauthStateKey(key), value, {
                    expirationTtl: OAUTH_STATE_TTL_SECONDS,
                });
            },
            get: async (key: string): Promise<NodeSavedState | undefined> => {
                return (
                    (await this.#kv.getJSON<NodeSavedState>(
                        this.#oauthStateKey(key)
                    )) ?? undefined
                );
            },
            del: async (key: string): Promise<void> => {
                await this.#kv.delete(this.#oauthStateKey(key));
            },
        };
    }

    oauthSessionStore(context: string) {
        return {
            set: async (
                did: string,
                value: NodeSavedSession
            ): Promise<void> => {
                const meta = {
                    ...(await oauthSessionMeta(value)),
                    storedAt: new Date().toISOString(),
                };
                await this.#kv.putJSON(this.#oauthSessionKey(did), value);
                try {
                    await this.#kv.putJSON(
                        this.#oauthSessionMetaKey(did),
                        meta
                    );
                } catch (error) {
                    console.error("sky-feeder:oauth-session", {
                        context,
                        step: "set:meta-failed",
                        did,
                        message:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
                logOAuthSession(context, "set", did, value, meta);
            },
            get: async (did: string): Promise<NodeSavedSession | undefined> => {
                const value =
                    (await this.#kv.getJSON<NodeSavedSession>(
                        this.#oauthSessionKey(did)
                    )) ?? undefined;
                const meta = value
                    ? await this.#kv.getJSON<OAuthSessionMeta>(
                          this.#oauthSessionMetaKey(did)
                      )
                    : null;
                logOAuthSession(
                    context,
                    value ? "get:hit" : "get:miss",
                    did,
                    value,
                    meta ?? undefined
                );
                return value;
            },
            // Refresh tokens are single-use, and feeds may be fetched by
            // multiple Worker isolates at once. The ATProto client asks the
            // store to delete a session after some refresh failures, but KV
            // cannot do a compare-and-delete, so a losing isolate can delete a
            // newer token set written by a winning isolate. Keep the session
            // and let future requests observe the latest KV value.
            del: async (did: string): Promise<void> => {
                console.info("sky-feeder:oauth-session", {
                    context,
                    step: "del:ignored",
                    did,
                });
            },
        };
    }

    async getOAuthSessionHashMaterial(
        did: string
    ): Promise<SkyOAuthSessionHashMaterial | null> {
        const session = await this.#kv.getJSON<NodeSavedSession>(
            this.#oauthSessionKey(did)
        );
        if (!session) {
            return null;
        }
        const meta = await this.#kv.getJSON<OAuthSessionMeta>(
            this.#oauthSessionMetaKey(did)
        );
        return oauthSessionHashMaterial(session, meta ?? undefined);
    }

    #sessionKey(id: string): string {
        return `${PREFIX}:session:${id}`;
    }

    #sessionFeedIdKey(id: string): string {
        return `${PREFIX}:session_feed_id:${id}`;
    }

    #sessionDidKey(did: string): string {
        return `${PREFIX}:session_did:${did}`;
    }

    #feedErrorStateKey(feedId: string): string {
        return `${PREFIX}:feed_error_state:${feedId}`;
    }

    #oauthStateKey(id: string): string {
        return `${PREFIX}:oauth_state:${id}`;
    }

    #oauthSessionKey(did: string): string {
        return `${PREFIX}:oauth_session:${did}`;
    }

    #oauthSessionMetaKey(did: string): string {
        return `${PREFIX}:oauth_session_meta:${did}`;
    }
}

type OAuthSessionMeta = {
    storedAt?: string;
    refreshTokenFingerprint?: string;
};

export type SkyOAuthSessionHashMaterial = {
    storedAt?: string;
    tokenSet: {
        aud?: unknown;
        sub?: unknown;
        iss?: unknown;
        scope?: unknown;
        expires_at?: unknown;
        accessTokenFingerprint?: string;
        refreshTokenFingerprint?: string;
    };
    hasDpopJwk: boolean;
    hasDpopKey: boolean;
    authMethod: {
        method?: unknown;
        kid?: unknown;
    };
};

export type SkyFeedErrorKind = "auth" | "error";

export type SkyFeedErrorState = {
    kind: SkyFeedErrorKind;
    signature: string;
    count: number;
    firstSeenAt: string;
    lastSeenAt: string;
    lastMessage: string;
};

type SkyFeedErrorEvent = {
    kind: SkyFeedErrorKind;
    signature: string;
    message: string;
};

function logOAuthSession(
    context: string,
    step: string,
    did: string,
    session: NodeSavedSession | undefined,
    meta: OAuthSessionMeta | undefined
): void {
    console.info("sky-feeder:oauth-session", {
        context,
        step,
        did,
        session: session ? oauthSessionSummary(session, meta) : null,
    });
}

function oauthSessionSummary(
    session: NodeSavedSession,
    meta: OAuthSessionMeta | undefined
) {
    const expiresAt = tokenExpiryDate(session.tokenSet.expires_at);
    return {
        topLevelKeys: Object.keys(session).sort(),
        storedAt: meta?.storedAt,
        tokenSet: {
            aud: session.tokenSet.aud,
            sub: session.tokenSet.sub,
            iss: session.tokenSet.iss,
            scope: session.tokenSet.scope,
            expires_at: session.tokenSet.expires_at,
            expiresAtIso: expiresAt?.toISOString(),
            secondsUntilExpiry: expiresAt
                ? Math.round((expiresAt.getTime() - Date.now()) / 1000)
                : undefined,
            hasAccessToken: Boolean(session.tokenSet.access_token),
            hasRefreshToken: Boolean(session.tokenSet.refresh_token),
            refreshTokenFingerprint: meta?.refreshTokenFingerprint,
        },
        hasDpopJwk: Boolean(
            "dpopJwk" in session &&
            (session as unknown as {dpopJwk?: unknown}).dpopJwk
        ),
        hasDpopKey: Boolean(
            "dpopKey" in session &&
            (session as unknown as {dpopKey?: unknown}).dpopKey
        ),
        authMethod: {
            method: session.authMethod.method,
            kid:
                "kid" in session.authMethod
                    ? (session.authMethod as {kid?: string}).kid
                    : undefined,
        },
    };
}

async function oauthSessionMeta(
    session: NodeSavedSession
): Promise<OAuthSessionMeta> {
    return {
        refreshTokenFingerprint: await tokenFingerprint(
            session.tokenSet.refresh_token
        ),
    };
}

async function oauthSessionHashMaterial(
    session: NodeSavedSession,
    meta: OAuthSessionMeta | undefined
): Promise<SkyOAuthSessionHashMaterial> {
    return {
        storedAt: meta?.storedAt,
        tokenSet: {
            aud: session.tokenSet.aud,
            sub: session.tokenSet.sub,
            iss: session.tokenSet.iss,
            scope: session.tokenSet.scope,
            expires_at: session.tokenSet.expires_at,
            accessTokenFingerprint: await tokenFingerprint(
                session.tokenSet.access_token
            ),
            refreshTokenFingerprint:
                meta?.refreshTokenFingerprint ??
                (await tokenFingerprint(session.tokenSet.refresh_token)),
        },
        hasDpopJwk: Boolean(
            "dpopJwk" in session &&
            (session as unknown as {dpopJwk?: unknown}).dpopJwk
        ),
        hasDpopKey: Boolean(
            "dpopKey" in session &&
            (session as unknown as {dpopKey?: unknown}).dpopKey
        ),
        authMethod: {
            method: session.authMethod.method,
            kid:
                "kid" in session.authMethod
                    ? (session.authMethod as {kid?: unknown}).kid
                    : undefined,
        },
    };
}

async function tokenFingerprint(
    token: string | undefined
): Promise<string | undefined> {
    if (!token) {
        return undefined;
    }
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token)
    );
    return Array.from(new Uint8Array(digest))
        .slice(0, OAUTH_TOKEN_FINGERPRINT_BYTES)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function tokenExpiryDate(expiresAt: unknown): Date | undefined {
    if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
        return new Date(expiresAt * 1000);
    }
    if (typeof expiresAt === "string") {
        const numericExpiresAt = Number(expiresAt);
        const date = Number.isFinite(numericExpiresAt)
            ? new Date(numericExpiresAt * 1000)
            : new Date(expiresAt);
        if (Number.isFinite(date.getTime())) {
            return date;
        }
    }
    return undefined;
}
