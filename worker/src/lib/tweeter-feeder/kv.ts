import type {KV} from "$lib/kv";
import {parseSessions} from "./fetcher";
import type {TweeterFeederSession} from "./types";

const SESSIONS_KEY = "tweeter-feeder:sessions";

export class TweeterFeederKV {
    #kv: KV;

    constructor(kv: KV) {
        this.#kv = kv;
    }

    async getSessions(): Promise<TweeterFeederSession[]> {
        const value = await this.#kv.getJSON(SESSIONS_KEY);
        return parseSessions(value);
    }

    async getCachedJSON<T>(key: string): Promise<CachedValue<T> | null> {
        const fullKey = this.#cacheKey(key);
        return await this.#kv.getJSON<CachedValue<T>>(fullKey);
    }

    async putCachedJSON<T>(
        key: string,
        value: T,
        expirationTtl: number
    ): Promise<void> {
        const fullKey = this.#cacheKey(key);
        await this.#kv.putJSON(
            fullKey,
            {
                value,
                fetchedAtIso: new Date().toISOString(),
            },
            {expirationTtl}
        );
    }

    async getCooldown(key: string): Promise<boolean> {
        const fullKey = this.#cooldownKey(key);
        return (await this.#kv.get(fullKey)) !== null;
    }

    async putCooldown(key: string, expirationTtl: number): Promise<void> {
        const fullKey = this.#cooldownKey(key);
        await this.#kv.put(fullKey, "1", {expirationTtl});
    }

    #cacheKey(key: string): string {
        return `tweeter-feeder:cache:${key}`;
    }

    #cooldownKey(key: string): string {
        return `tweeter-feeder:cooldown:${key}`;
    }
}

export type CachedValue<T> = {
    value: T;
    fetchedAtIso: string;
};
