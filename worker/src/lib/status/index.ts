export type StatusProvider = "mastodon" | "bluesky" | "twitter";

export type Status = {
    id: string;
    permalink: string;
    provider: StatusProvider;
    author: StatusAccount;
    createdAtIso: string;
    updatedAtIso: string;
    createdAtLabel: string;
    titleText: string;
    contentHtml: string;
    spoilerText?: string;
    attachments: StatusAttachment[];
    poll?: StatusPoll | null;
    card?: StatusCard | null;
    quote?: Status | null;
    repost?: StatusRepost | null;
    applicationName?: string | null;
    parentUrl?: string | null;
    debugJson?: unknown;
};

export type StatusCard = {
    url: string;
    title: string;
    description?: string | null;
    imageUrl?: string | null;
    iframe?: StatusIframe | null;
};

export type StatusRepost = {
    by: StatusAccount;
    status: Status;
    label: string;
};

export type StatusIframe = {
    url: string;
    title: string;
    width: number;
    height: number;
};

export type StatusAttachment = {
    id: string;
    type: string;
    url: string;
    previewUrl?: string;
    posterUrl?: string;
    description: string;
};

export type StatusPoll = {
    votesCount: number;
    options: StatusPollOption[];
};

export type StatusPollOption = {
    title: string;
    votesCount?: number | null;
};

export type StatusAccount = {
    displayName: string;
    username: string;
    url: string;
    avatarUrl: string;
};
