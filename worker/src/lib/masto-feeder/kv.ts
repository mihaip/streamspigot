import type {
    MastoFeederApp,
    MastoFeederAuthRequest,
    MastoFeederPrefs,
    MastoFeederSession,
} from "./types";
import type {KV} from "../kv";

export type MastoFeederKVRecord<T> = {
    key: string;
    value: T;
};

export class MastoFeederKV {
    #kv: KV;

    constructor(kv: KV) {
        this.#kv = kv;
    }

    async getApp(instanceUrl: string): Promise<MastoFeederApp | null> {
        return await this.#kv.getJSON(this.#appKey(instanceUrl));
    }

    async putApp(app: MastoFeederApp): Promise<void> {
        return await this.#kv.putJSON(this.#appKey(app.instanceUrl), app);
    }

    async deleteApp(instanceUrl: string): Promise<void> {
        return await this.#kv.delete(this.#appKey(instanceUrl));
    }

    async listApps(): Promise<MastoFeederKVRecord<MastoFeederApp>[]> {
        return await this.#listJSONRecords("app:");
    }

    #appKey(instanceUrl: string): string {
        return `app:${instanceUrl}`;
    }

    async getAuthRequest(id: string): Promise<MastoFeederAuthRequest | null> {
        return await this.#kv.getJSON(this.#authRequestKey(id));
    }

    async putAuthRequest(authRequest: MastoFeederAuthRequest): Promise<void> {
        return await this.#kv.putJSON(
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
        return this.#kv.getJSON(this.#sessionKey(id));
    }

    async listSessions(): Promise<MastoFeederKVRecord<MastoFeederSession>[]> {
        return await this.#listJSONRecords("session:");
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
        return await this.#kv.putJSON(
            this.#sessionKey(session.sessionId),
            session
        );
    }

    async deleteSession(session: MastoFeederSession): Promise<void> {
        await this.#kv.delete(this.#sessionFeedIdKey(session.feedId));
        await this.#kv.delete(
            this.#sessionMastodonIdKey(session.instanceUrl, session.mastodonId)
        );
        await this.#kv.delete(this.#sessionKey(session.sessionId));
    }

    async updateSessionInstanceUrl(
        session: MastoFeederSession,
        instanceUrl: string
    ): Promise<MastoFeederSession> {
        await this.#kv.delete(
            this.#sessionMastodonIdKey(session.instanceUrl, session.mastodonId)
        );
        session.instanceUrl = instanceUrl;
        await this.#kv.put(
            this.#sessionMastodonIdKey(session.instanceUrl, session.mastodonId),
            session.sessionId
        );
        await this.#kv.putJSON(this.#sessionKey(session.sessionId), session);
        return session;
    }

    // We don't expose generic mutation methods so that we can know which
    // indexes we need to update.
    async updateSessionToken(
        session: MastoFeederSession,
        accessToken: string
    ): Promise<MastoFeederSession> {
        session.accessToken = accessToken;
        await this.#kv.putJSON(this.#sessionKey(session.sessionId), session);
        return session;
    }

    async updateSessionFeedId(
        session: MastoFeederSession,
        feedId: string
    ): Promise<MastoFeederSession> {
        await this.#kv.delete(this.#sessionFeedIdKey(session.feedId));
        session.feedId = feedId;
        await this.#kv.putJSON(this.#sessionKey(session.sessionId), session);
        await this.#kv.put(this.#sessionFeedIdKey(feedId), session.sessionId);
        return session;
    }

    async updateSessionPrefs(
        session: MastoFeederSession,
        prefs: MastoFeederPrefs
    ): Promise<MastoFeederSession> {
        session.prefs = prefs;
        await this.#kv.putJSON(this.#sessionKey(session.sessionId), session);
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

    async #listJSONRecords<T>(
        prefix: string
    ): Promise<MastoFeederKVRecord<T>[]> {
        const records: MastoFeederKVRecord<T>[] = [];
        let cursor: string | undefined;
        do {
            const result = await this.#kv.list({prefix, cursor, limit: 1000});
            const keyChunks = chunks(
                result.keys.map(key => key.name),
                100
            );
            const valueChunks = await Promise.all(
                keyChunks.map(async keys => ({
                    keys,
                    values: await this.#kv.getJSONBatch<T>(keys),
                }))
            );
            for (const {keys, values} of valueChunks) {
                for (const key of keys) {
                    const value = values.get(key);
                    if (value) {
                        records.push({key, value});
                    }
                }
            }
            cursor = result.cursor;
            if (result.listComplete) {
                cursor = undefined;
            }
        } while (cursor);
        return records;
    }
}

function chunks<T>(values: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < values.length; i += size) {
        result.push(values.slice(i, i + size));
    }
    return result;
}
