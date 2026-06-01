import type {RuntimeLock} from "@atproto/oauth-client-node";
import type {SkyOAuthLock, SkyOAuthLockGrant} from "./oauth-lock-do";

const LOCK_LEASE_MS = 60_000;
const LOCK_WAIT_MS = 60_000;

export function createSkyOAuthRequestLock(
    namespace: DurableObjectNamespace
): RuntimeLock {
    return async (name, fn) => {
        const lock = skyOAuthLockStub(namespace, name);
        const grant: SkyOAuthLockGrant = await lock.acquire({
            leaseMs: LOCK_LEASE_MS,
            waitMs: LOCK_WAIT_MS,
        });
        try {
            return await fn();
        } finally {
            try {
                await lock.release(grant);
            } catch (error) {
                console.error("sky-feeder:oauth-lock", {
                    step: "release:failed",
                    lockName: name,
                    message:
                        error instanceof Error ? error.message : String(error),
                });
            }
        }
    };
}

function skyOAuthLockStub(
    namespace: DurableObjectNamespace,
    name: string
): DurableObjectStub<SkyOAuthLock> {
    return namespace.getByName(
        name
    ) as unknown as DurableObjectStub<SkyOAuthLock>;
}
