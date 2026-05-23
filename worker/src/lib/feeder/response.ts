import type {FeedOutput} from "$lib/status/feed";

export function feedOutputResponse({body, contentType}: FeedOutput): Response {
    return new Response(new TextEncoder().encode(body), {
        headers: {
            "Content-Type": `${contentType}; charset=utf-8`,
        },
    });
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json; charset=utf-8");
    }
    return new Response(`${JSON.stringify(body, null, 2)}\n`, {
        ...init,
        headers,
    });
}
