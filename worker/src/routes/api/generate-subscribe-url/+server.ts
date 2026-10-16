import {generateSubscribeUrl} from "$lib/feeder/subscribe-url";
import type {RequestHandler} from "./$types";

export const POST: RequestHandler = async ({request, url}) => {
    const contentType = request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim();
    if (contentType?.toLowerCase() !== "application/json") {
        return new Response("Send a JSON body with a url string.", {
            status: 415,
        });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return new Response("Invalid JSON body.", {status: 400});
    }
    if (
        !body ||
        typeof body !== "object" ||
        !("url" in body) ||
        typeof body.url !== "string" ||
        !body.url.trim()
    ) {
        return new Response("Provide a non-empty url string.", {status: 400});
    }

    const subscribeUrl = generateSubscribeUrl(body.url, url.origin);
    if (!subscribeUrl) {
        return new Response(
            "Unsupported URL. Provide an X/Twitter profile, post, or search URL with a valid query.",
            {status: 400}
        );
    }
    return new Response(subscribeUrl, {
        headers: {"Content-Type": "text/plain; charset=utf-8"},
    });
};
