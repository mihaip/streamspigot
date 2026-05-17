/// <reference types="@sveltejs/adapter-cloudflare/ambient" />
/// <reference types="@cloudflare/workers-types" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../worker-configuration.d.ts" />

import type {MastoFeederSession} from "$lib/masto-feeder/types";

declare global {
    namespace App {
        interface Platform {
            env: Env;
        }
        interface Locals {
            mastoFeederSession?: MastoFeederSession;
        }
    }
}

export {};
