export type MastoFeederApp = {
    instanceUrl: string;
    clientId: string;
    clientSecret: string;
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
