/// <reference types="@sveltejs/adapter-cloudflare/ambient" />
/// <reference types="@cloudflare/workers-types" />

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
