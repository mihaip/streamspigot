export interface KV {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;

    getJSON<T>(key: string): Promise<T | null>;
    putJSON<T>(key: string, value: T): Promise<void>;
}

export class WorkerKV implements KV {
    #kv: KVNamespace;

    constructor(kv: KVNamespace) {
        this.#kv = kv;
    }

    async get(key: string): Promise<string | null> {
        return await this.#kv.get(key);
    }

    async put(key: string, value: string): Promise<void> {
        return await this.#kv.put(key, value);
    }

    async delete(key: string): Promise<void> {
        return await this.#kv.delete(key);
    }

    async getJSON<T>(key: string): Promise<T | null> {
        return await this.#kv.get(key, {type: "json"});
    }

    async putJSON<T>(key: string, value: T): Promise<void> {
        return await this.#kv.put(key, JSON.stringify(value));
    }
}
