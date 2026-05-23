import type {Handle} from "@sveltejs/kit";

export const handle: Handle = ({event, resolve}) => {
    const canonicalUrl = skyFeederCanonicalSignInUrl(
        event.url,
        event.request.method
    );
    if (canonicalUrl) {
        return Response.redirect(canonicalUrl, 302);
    }

    return resolve(event);
};

function skyFeederCanonicalSignInUrl(
    url: URL,
    requestMethod: string
): URL | null {
    if (
        requestMethod === "GET" &&
        url.hostname.startsWith("www.") &&
        (url.pathname === "/sky-feeder" || url.pathname === "/sky-feeder/")
    ) {
        const canonicalUrl = new URL(url);
        // TODO(#9): replace this minimal Sky Feeder sign-in redirect with
        // deliberate canonical host handling for all feeder auth and feed URLs.
        canonicalUrl.hostname = url.hostname.replace(/^www\./, "");
        return canonicalUrl;
    }

    return null;
}
