export type MastoFeederApp = {
    instanceUrl: string;
    clientId: string;
    clientSecret: string;
    registeredRedirectUris?: string[];
    registeredRedirectUri?: string | null;
    registeredScopes?: string[];
    registeredName?: string | null;
    registeredWebsite?: string | null;
    appRecordFetchedAt?: string;
    appRecordFetchRedirectUriUsed?: string | null;
    appRecordFetchError?: string;
};

export type MastoFeederAuthRequest = {
    id: string;
    instanceUrl: string;
};

export type MastoFeederSession = {
    sessionId: string;
    mastodonId: string;
    instanceUrl: string;
    feedId: string;
    accessToken: string;
    prefs?: MastoFeederPrefs;
};

export type MastoFeederPrefs = {
    timeZone?: string;
    useLocalUrls?: boolean;
};
