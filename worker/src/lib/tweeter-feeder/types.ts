export type TweeterFeederSession = {
    kind: "cookie";
    authToken: string;
    ct0: string;
    username?: string;
    id?: string;
};

export type TwitterUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    url: string;
    protected?: boolean;
    suspended?: boolean;
};

export type TwitterTweet = {
    id: string;
    author: TwitterUser;
    text: string;
    createdAt: string;
    displayTextRange?: [number, number];
    entities?: TwitterEntities;
    media: TwitterMedia[];
    card?: TwitterCard | null;
    poll?: TwitterPoll | null;
    quote?: TwitterTweet | null;
    retweet?: TwitterTweet | null;
    source?: string | null;
    replyToStatusId?: string | null;
    replyToUsername?: string | null;
    debugJson?: unknown;
};

export type TwitterEntities = {
    urls?: TwitterUrlEntity[];
    hashtags?: TwitterHashtagEntity[];
    userMentions?: TwitterMentionEntity[];
    media?: TwitterUrlEntity[];
};

export type TwitterUrlEntity = {
    start: number;
    end: number;
    url: string;
    expandedUrl?: string;
    displayUrl?: string;
};

export type TwitterHashtagEntity = {
    start: number;
    end: number;
    text: string;
};

export type TwitterMentionEntity = {
    start: number;
    end: number;
    username: string;
};

export type TwitterMedia = {
    id: string;
    type: "image" | "video" | "gifv";
    url: string;
    previewUrl?: string;
    posterUrl?: string;
    description: string;
};

export type TwitterCard = {
    url: string;
    title: string;
    description?: string | null;
    imageUrl?: string | null;
};

export type TwitterPoll = {
    votesCount: number;
    options: TwitterPollOption[];
};

export type TwitterPollOption = {
    title: string;
    votesCount?: number | null;
};

export type TwitterTimelineResult = {
    username: string;
    tweets: TwitterTweet[];
    fromStaleCache: boolean;
};

export type TwitterFetchError = {
    username: string;
    message: string;
};
