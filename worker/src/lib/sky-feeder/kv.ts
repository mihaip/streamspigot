import type {KV} from "$lib/kv";
import type {
    NodeSavedSession,
    NodeSavedState,
} from "@atproto/oauth-client-node";
import type {SkyFeederPrefs, SkyFeederSession} from "./types";

const PREFIX = "sky-feeder";
const OAUTH_STATE_TTL_SECONDS = 60 * 60;

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

    oauthSessionStore() {
        return {
            set: async (
                did: string,
                value: NodeSavedSession
            ): Promise<void> => {
                await this.#kv.putJSON(this.#oauthSessionKey(did), value);
            },
            get: async (did: string): Promise<NodeSavedSession | undefined> => {
                return (
                    (await this.#kv.getJSON<NodeSavedSession>(
                        this.#oauthSessionKey(did)
                    )) ?? undefined
                );
            },
            // Refresh tokens are single-use, and feeds may be fetched by
            // multiple Worker isolates at once. The ATProto client asks the
            // store to delete a session after some refresh failures, but KV
            // cannot do a compare-and-delete, so a losing isolate can delete a
            // newer token set written by a winning isolate. Keep the session
            // and let future requests observe the latest KV value.
            del: async (): Promise<void> => {},
        };
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

    #oauthStateKey(id: string): string {
        return `${PREFIX}:oauth_state:${id}`;
    }

    #oauthSessionKey(did: string): string {
        return `${PREFIX}:oauth_session:${did}`;
    }
}
