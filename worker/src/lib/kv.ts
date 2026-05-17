import type {RequestEvent} from "@sveltejs/kit";

export interface KV {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: KVPutOptions): Promise<void>;
    delete(key: string): Promise<void>;

    getJSON<T>(key: string): Promise<T | null>;
    putJSON<T>(key: string, value: T, options?: KVPutOptions): Promise<void>;
}

export type KVPutOptions = {
    expirationTtl?: number;
};

export class WorkerKV implements KV {
    #kv: KVNamespace;

    constructor(kv: KVNamespace) {
        this.#kv = kv;
    }

    static fromEvent(event: RequestEvent): WorkerKV {
        if (!event.platform) {
            throw new Error("Cloudflare platform bindings are not available");
        }
        return new WorkerKV(event.platform.env.STREAMSPIGOT);
    }

    async get(key: string): Promise<string | null> {
        return await this.#kv.get(key);
    }

    async put(
        key: string,
        value: string,
        options?: KVPutOptions
    ): Promise<void> {
        return await this.#kv.put(key, value, options);
    }

    async delete(key: string): Promise<void> {
        return await this.#kv.delete(key);
    }

    async getJSON<T>(key: string): Promise<T | null> {
        return await this.#kv.get(key, {type: "json"});
    }

    async putJSON<T>(
        key: string,
        value: T,
        options?: KVPutOptions
    ): Promise<void> {
        return await this.#kv.put(key, JSON.stringify(value), options);
    }
}
