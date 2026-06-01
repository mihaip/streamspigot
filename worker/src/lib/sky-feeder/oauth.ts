import {APP_NAME} from "$lib/constants";
import {Agent} from "@atproto/api";
import {
    AtprotoHandleResolver,
    type ResolveTxt,
} from "@atproto-labs/handle-resolver";
import type {
    AtprotoIdentityDidMethods,
    DidResolver,
    ResolveDidOptions,
    ResolvedDocument,
} from "@atproto-labs/did-resolver";
import {
    assertDidPlc,
    assertDidWeb,
    didDocumentValidator,
    didWebToUrl,
    extractDidMethod,
    type Did,
} from "@atproto/did";
import {
    JoseKey,
    NodeOAuthClient,
    type OAuthClientMetadataInput,
    type RuntimeLock,
    type NodeSavedSessionStore,
    type NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import {resolveTxt} from "node:dns/promises";

const BSKY_APPVIEW_AUDIENCE = "did:web:api.bsky.app#bsky_appview";

export const OAUTH_SCOPE = [
    "atproto",
    bskyAppViewScope("app.bsky.actor.getProfile"),
    bskyAppViewScope("app.bsky.feed.getTimeline"),
].join(" ");

export async function createSkyOAuthClient({
    baseUrl,
    stateStore,
    sessionStore,
    privateJwk,
    requestLock,
}: SkyOAuthClientOptions): Promise<NodeOAuthClient> {
    const keyId =
        typeof privateJwk.kid === "string" ? privateJwk.kid : "default";
    const key = await JoseKey.fromJWK(privateJwk, keyId);
    return new NodeOAuthClient({
        clientMetadata: skyClientMetadata(baseUrl),
        keyset: [key],
        stateStore,
        sessionStore,
        responseMode: "query",
        allowHttp: baseUrl.startsWith("http://"),
        requestLock,
        handleResolver: createWorkerHandleResolver(),
        didResolver: createWorkerDidResolver(),
        fetch: oauthFetch,
    });
}

export function skyClientMetadata(baseUrl: string): OAuthClientMetadataInput {
    return {
        client_id: `${baseUrl}/oauth-client-metadata.json`,
        client_name: `${APP_NAME} - Sky Feeder`,
        client_uri: baseUrl,
        redirect_uris: [`${baseUrl}/sign-in-callback`],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        application_type: "web",
        scope: OAUTH_SCOPE,
        token_endpoint_auth_method: "private_key_jwt",
        token_endpoint_auth_signing_alg: "ES256",
        dpop_bound_access_tokens: true,
        jwks_uri: `${baseUrl}/jwks.json`,
    };
}

export async function skyJwks(privateJwk: Record<string, unknown>) {
    const keyId =
        typeof privateJwk.kid === "string" ? privateJwk.kid : "default";
    const key = await JoseKey.fromJWK(privateJwk, keyId);
    return {keys: [key.publicJwk]};
}

export async function createSkyAgent(
    oauthClient: NodeOAuthClient,
    did: string
): Promise<Agent> {
    const oauthSession = await oauthClient.restore(did);
    return new Agent(oauthSession);
}

export type SkyOAuthClientOptions = {
    baseUrl: string;
    stateStore: NodeSavedStateStore;
    sessionStore: NodeSavedSessionStore;
    privateJwk: Record<string, unknown>;
    requestLock: RuntimeLock;
};

export function parsePrivateJwk(
    rawJwk: string | undefined
): Record<string, unknown> {
    if (!rawJwk) {
        throw new Error("ATPROTO_OAUTH_PRIVATE_JWK is not configured");
    }
    const jwk = JSON.parse(rawJwk);
    if (!jwk || typeof jwk !== "object") {
        throw new Error("ATPROTO_OAUTH_PRIVATE_JWK is not a JSON object");
    }
    return jwk as Record<string, unknown>;
}

function bskyAppViewScope(method: string): string {
    return `rpc:${method}?aud=${BSKY_APPVIEW_AUDIENCE.replace("#", "%23")}`;
}

async function oauthFetch(
    input: string | URL | Request,
    init?: RequestInit
): Promise<Response> {
    const request = workerSafeFetchRequest(input, init);
    const response = await fetch.call(null, request.input, request.init);
    if (request.rejectRedirect && isRedirect(response.status)) {
        await response.body?.cancel();
        throw new TypeError(
            `Fetch received redirect response ${response.status} with redirect mode "error"`
        );
    }
    return response;
}

function workerSafeFetchRequest(
    input: string | URL | Request,
    init?: RequestInit
): WorkerSafeFetchRequest {
    const request = normalizeRequest(input, init);
    if (request.init?.cache === "no-cache") {
        const headers = new Headers(request.init.headers);
        if (!headers.has("cache-control")) {
            headers.set("cache-control", "no-cache");
        }
        request.init = {
            ...request.init,
            cache: undefined,
            headers,
        };
    }
    return request;
}

function normalizeRequest(
    input: string | URL | Request,
    init?: RequestInit
): WorkerSafeFetchRequest {
    if (init?.redirect === "error") {
        return {
            input,
            init: {...init, redirect: "manual"},
            rejectRedirect: true,
        };
    }

    if (input instanceof Request && input.redirect === "error") {
        return {
            input: new Request(input, {
                ...init,
                redirect: "manual",
            }),
            init: undefined,
            rejectRedirect: true,
        };
    }

    return {
        input,
        init,
        rejectRedirect: false,
    };
}

function isRedirect(status: number): boolean {
    return status >= 300 && status < 400;
}

type WorkerSafeFetchRequest = {
    input: string | URL | Request;
    init: RequestInit | undefined;
    rejectRedirect: boolean;
};

function createWorkerHandleResolver(): AtprotoHandleResolver {
    return new AtprotoHandleResolver({
        fetch: oauthFetch,
        resolveTxt: workerResolveTxt,
    });
}

function createWorkerDidResolver(): DidResolver<AtprotoIdentityDidMethods> {
    return {
        resolve: resolveWorkerDid,
    };
}

async function resolveWorkerDid<D extends Did>(
    did: D,
    options?: ResolveDidOptions
): Promise<ResolvedDocument<D, AtprotoIdentityDidMethods>> {
    options?.signal?.throwIfAborted();

    const url = didDocumentUrl(did);
    const response = await oauthFetch(url, {
        redirect: "error",
        headers: {accept: "application/did+ld+json,application/json"},
        signal: options?.signal,
    });

    if (!response.ok) {
        throw new Error(
            `DID document fetch failed with HTTP status ${response.status}`
        );
    }

    const document = didDocumentValidator.parse(await response.json());
    if (document.id !== did) {
        throw new Error(`DID document id (${document.id}) does not match DID`);
    }

    return document as ResolvedDocument<D, AtprotoIdentityDidMethods>;
}

function didDocumentUrl(did: Did): URL {
    const method = extractDidMethod(did);
    if (method === "plc") {
        assertDidPlc(did);
        return new URL(`/${encodeURIComponent(did)}`, "https://plc.directory/");
    }

    if (method === "web") {
        assertDidWeb(did);
        return didWebDocumentUrl(did);
    }

    throw new Error(`Unsupported DID method "${method}"`);
}

function didWebDocumentUrl(did: Did<"web">): URL {
    const url = didWebToUrl(did);
    if (url.pathname === "/") {
        return new URL("/.well-known/did.json", url);
    }
    return new URL(`${url.pathname}/did.json`, url);
}

const workerResolveTxt: ResolveTxt = async hostname => {
    try {
        const records = await resolveTxt(hostname);
        return records.map(chunks => chunks.join(""));
    } catch {
        return null;
    }
};
