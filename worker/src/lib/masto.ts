import * as masto from "masto";

const API_TIMEOUT_MS = 30_000;

export function createOAuthAPIClient(
    props: Parameters<typeof masto.createOAuthAPIClient>[0]
) {
    return masto.createOAuthAPIClient({
        ...props,
        timeout: API_TIMEOUT_MS,
        requestInit: {
            ...props.requestInit,
            headers: {
                "User-Agent":
                    "Masto-Feeder; (+https://www.streamspigot.com/masto-feeder)",
                ...props.requestInit?.headers,
            },
        },
    });
}

export function createRestAPIClient(
    props: Parameters<typeof masto.createRestAPIClient>[0]
) {
    return masto.createRestAPIClient({
        ...props,
        timeout: API_TIMEOUT_MS,
        requestInit: {
            ...props.requestInit,
            headers: {
                "User-Agent":
                    "Masto-Feeder; (+https://www.streamspigot.com/masto-feeder)",
                ...props.requestInit?.headers,
            },
        },
    });
}
