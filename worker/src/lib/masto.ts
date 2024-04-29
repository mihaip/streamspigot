import * as masto from "masto";

export function createOAuthAPIClient(
    props: Parameters<typeof masto.createOAuthAPIClient>[0]
) {
    return masto.createOAuthAPIClient({
        ...props,
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
