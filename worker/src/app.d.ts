/// <reference types="@sveltejs/adapter-cloudflare-workers" />
/// <reference types="@cloudflare/workers-types/2023-07-01" />

import type {MastoFeederSession} from "$lib/masto-feeder/types";

declare global {
    namespace App {
        interface Platform {
            env?: {
                MASTOFEEDER: KVNamespace;
            };
        }
        interface Locals {
            mastoFeederSession?: MastoFeederSession;
        }
    }
}

export {};
