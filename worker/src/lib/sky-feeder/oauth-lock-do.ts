import {DurableObject} from "cloudflare:workers";

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_WAIT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;

export class SkyOAuthLock extends DurableObject {
    #owner: LockOwner | undefined;
    #waiters: LockWaiter[] = [];
    #leaseTimer: ReturnType<typeof setTimeout> | undefined;

    async acquire(
        options: SkyOAuthLockAcquireOptions = {}
    ): Promise<SkyOAuthLockGrant> {
        const leaseMs = normalizeDuration(options.leaseMs, DEFAULT_LEASE_MS);
        const waitMs = normalizeDuration(options.waitMs, DEFAULT_WAIT_MS);

        return new Promise((resolve, reject) => {
            const waiter: LockWaiter = {
                token: crypto.randomUUID(),
                leaseMs,
                resolve,
                reject,
                timeout: setTimeout(() => {
                    this.#removeWaiter(waiter);
                    reject(new Error("Timed out waiting for Sky OAuth lock"));
                    console.warn("sky-feeder:oauth-lock", {
                        step: "acquire:timeout",
                        lockName: this.ctx.id.name,
                        waitMs,
                    });
                }, waitMs),
            };
            this.#waiters.push(waiter);
            console.info("sky-feeder:oauth-lock", {
                step: "acquire:queued",
                lockName: this.ctx.id.name,
                queueLength: this.#waiters.length,
            });
            this.#drain();
        });
    }

    async release(grant: SkyOAuthLockGrant): Promise<void> {
        if (!this.#owner || this.#owner.token !== grant.token) {
            console.warn("sky-feeder:oauth-lock", {
                step: "release:stale",
                lockName: this.ctx.id.name,
            });
            return;
        }

        this.#clearOwner();
        console.info("sky-feeder:oauth-lock", {
            step: "release:success",
            lockName: this.ctx.id.name,
            queueLength: this.#waiters.length,
        });
        this.#drain();
    }

    #drain(): void {
        if (this.#owner && this.#owner.expiresAt <= Date.now()) {
            console.warn("sky-feeder:oauth-lock", {
                step: "lease:expired",
                lockName: this.ctx.id.name,
                queueLength: this.#waiters.length,
            });
            this.#clearOwner();
        }

        if (this.#owner) {
            return;
        }

        const waiter = this.#waiters.shift();
        if (!waiter) {
            return;
        }

        clearTimeout(waiter.timeout);
        const grant = {
            token: waiter.token,
            expiresAt: Date.now() + waiter.leaseMs,
        };
        this.#owner = grant;
        this.#scheduleLeaseExpiry();
        waiter.resolve(grant);
        console.info("sky-feeder:oauth-lock", {
            step: "acquire:granted",
            lockName: this.ctx.id.name,
            queueLength: this.#waiters.length,
            leaseMs: waiter.leaseMs,
        });
    }

    #removeWaiter(waiter: LockWaiter): void {
        const index = this.#waiters.indexOf(waiter);
        if (index !== -1) {
            this.#waiters.splice(index, 1);
        }
    }

    #clearOwner(): void {
        if (this.#leaseTimer) {
            clearTimeout(this.#leaseTimer);
            this.#leaseTimer = undefined;
        }
        this.#owner = undefined;
    }

    #scheduleLeaseExpiry(): void {
        if (!this.#owner) {
            return;
        }

        if (this.#leaseTimer) {
            clearTimeout(this.#leaseTimer);
        }

        this.#leaseTimer = setTimeout(
            () => {
                this.#drain();
            },
            Math.max(0, this.#owner.expiresAt - Date.now())
        );
    }
}

export type SkyOAuthLockAcquireOptions = {
    leaseMs?: number;
    waitMs?: number;
};

export type SkyOAuthLockGrant = {
    token: string;
    expiresAt: number;
};

type LockOwner = SkyOAuthLockGrant;

type LockWaiter = {
    token: string;
    leaseMs: number;
    resolve: (grant: SkyOAuthLockGrant) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
};

function normalizeDuration(
    value: number | undefined,
    fallback: number
): number {
    if (!Number.isFinite(value) || value === undefined || value <= 0) {
        return fallback;
    }
    return Math.min(value, MAX_TIMEOUT_MS);
}
