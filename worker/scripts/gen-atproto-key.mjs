import {JoseKey} from "@atproto/oauth-client-node";

const key = await JoseKey.generate(["ES256"], crypto.randomUUID());
console.log(JSON.stringify(key.privateJwk));
