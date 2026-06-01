/**
 * @fileoverview Wrangler deploy entrypoint that wraps SvelteKit's generated
 * Worker so the same deployed script can also export Durable Object classes.
 */
import svelteWorker from "./.svelte-kit/cloudflare/_worker.js";
import {SkyOAuthLock} from "./src/lib/sky-feeder/oauth-lock-do";

export {SkyOAuthLock};
export default svelteWorker;
