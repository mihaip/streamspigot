import type {Handle} from "@sveltejs/kit";

export const handle: Handle = ({event, resolve}) => {
    const redirectUrl = canonicalUrl(event.url, event.request.method);
    if (redirectUrl) {
        return Response.redirect(redirectUrl, 301);
    }

    return resolve(event);
};

function canonicalUrl(url: URL, requestMethod: string): URL | null {
    if (requestMethod === "GET" && url.hostname === "streamspigot.com") {
        const canonicalUrl = new URL(url);
        canonicalUrl.hostname = "www.streamspigot.com";
        return canonicalUrl;
    }

    return null;
}
