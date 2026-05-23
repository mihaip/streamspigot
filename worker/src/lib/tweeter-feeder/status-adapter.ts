import type {
    TwitterEntities,
    TwitterHashtagEntity,
    TwitterMentionEntity,
    TwitterTweet,
    TwitterUrlEntity,
} from "./types";
import type {
    Status,
    StatusAccount,
    StatusAttachment,
    StatusCard,
    StatusPoll,
} from "$lib/status";
import {escapeHtml, escapeHtmlAttribute} from "$lib/html";
import {truncate} from "$lib/strings";

const TWITTER_BASE_URL = "https://twitter.com";

export type TwitterAdapterEnv = {
    timeZone: string;
};

export function toStatus(tweet: TwitterTweet, env: TwitterAdapterEnv): Status {
    const permalinkTweet = tweet.retweet ?? tweet;
    const repostStatus = tweet.retweet ? toStatus(tweet.retweet, env) : null;

    return {
        id: statusUrl(permalinkTweet),
        permalink: statusUrl(permalinkTweet),
        provider: "twitter",
        author: toStatusAccount(tweet.author),
        createdAtIso: new Date(tweet.createdAt).toISOString(),
        updatedAtIso: new Date(tweet.createdAt).toISOString(),
        createdAtLabel: formatCreatedAt(tweet.createdAt, env),
        titleText: titleAsText(tweet),
        headlineText: headlineAsText(tweet),
        contentHtml: contentAsHtml(tweet),
        attachments: tweet.media.map(toStatusAttachment),
        poll: tweet.poll ? toStatusPoll(tweet.poll) : null,
        card: tweet.card ? toStatusCard(tweet.card) : null,
        quote: tweet.quote ? toStatus(tweet.quote, env) : null,
        repost: repostStatus
            ? {
                  by: toStatusAccount(tweet.author),
                  status: repostStatus,
                  label: "retweeted",
              }
            : null,
        applicationName: tweet.source ? stripHtml(tweet.source) : null,
        parentUrl:
            permalinkTweet.replyToStatusId && permalinkTweet.replyToUsername
                ? `${TWITTER_BASE_URL}/${permalinkTweet.replyToUsername}/status/${permalinkTweet.replyToStatusId}`
                : null,
        debugJson: tweet.debugJson ?? tweet,
    };
}

function toStatusAccount(user: TwitterTweet["author"]): StatusAccount {
    return {
        displayName: user.displayName || user.username,
        username: user.username,
        url: user.url,
        avatarUrl: user.avatarUrl,
    };
}

function toStatusAttachment(
    media: TwitterTweet["media"][number]
): StatusAttachment {
    return {
        id: media.id,
        type: media.type,
        url: media.url,
        previewUrl: media.previewUrl,
        posterUrl: media.posterUrl,
        description: media.description,
    };
}

function toStatusPoll(poll: NonNullable<TwitterTweet["poll"]>): StatusPoll {
    return {
        votesCount: poll.votesCount,
        options: poll.options.map(option => ({
            title: option.title,
            votesCount: option.votesCount,
        })),
    };
}

function toStatusCard(card: NonNullable<TwitterTweet["card"]>): StatusCard {
    return {
        url: card.url,
        title: card.title,
        description: card.description,
        imageUrl: card.imageUrl,
    };
}

function statusUrl(tweet: TwitterTweet): string {
    return `${TWITTER_BASE_URL}/${tweet.author.username}/status/${tweet.id}`;
}

function formatCreatedAt(createdAt: string, env: TwitterAdapterEnv): string {
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
        timeZone: env.timeZone,
    }).format(new Date(createdAt));
}

function titleAsText(tweet: TwitterTweet): string {
    return `${tweet.author.username}: ${headlineAsText(tweet)}`;
}

function headlineAsText(tweet: TwitterTweet): string {
    const contentTweet = tweet.retweet ?? tweet;
    const prefix = tweet.retweet
        ? `RT @${tweet.retweet.author.username}: `
        : "";
    const quoteSuffix = tweet.quote
        ? ` (quoting @${tweet.quote.author.username})`
        : "";
    return truncate(`${prefix}${plainText(contentTweet)}${quoteSuffix}`);
}

function plainText(tweet: TwitterTweet): string {
    return tweet.text.replace(/\s+/g, " ").trim();
}

function contentAsHtml(tweet: TwitterTweet): string {
    if (tweet.retweet) {
        return "";
    }
    return textWithEntitiesAsHtml(
        displayText(tweet),
        tweet.entities,
        tweet.displayTextRange?.[0] ?? 0
    );
}

function displayText(tweet: TwitterTweet): string {
    if (!tweet.displayTextRange) {
        return tweet.text;
    }
    const chars = Array.from(tweet.text);
    return chars
        .slice(tweet.displayTextRange[0], tweet.displayTextRange[1])
        .join("");
}

function textWithEntitiesAsHtml(
    text: string,
    entities: TwitterEntities | undefined,
    offset: number
): string {
    const chars = Array.from(text);
    const renderEntities = allEntities(entities, offset)
        .filter(entity => entity.start >= 0 && entity.end > entity.start)
        .sort((a, b) => a.start - b.start);

    let result = "";
    let cursor = 0;
    for (const entity of renderEntities) {
        if (entity.start < cursor || entity.start > chars.length) {
            continue;
        }
        result += escapeHtml(chars.slice(cursor, entity.start).join(""));
        result += entityAsHtml(
            chars.slice(entity.start, entity.end).join(""),
            entity
        );
        cursor = entity.end;
    }
    result += escapeHtml(chars.slice(cursor).join(""));
    return result.replace(/\n/g, "<br />");
}

type RenderEntity =
    | ({type: "url"} & TwitterUrlEntity)
    | ({type: "hashtag"} & TwitterHashtagEntity)
    | ({type: "mention"} & TwitterMentionEntity);

function allEntities(
    entities: TwitterEntities | undefined,
    offset: number
): RenderEntity[] {
    if (!entities) {
        return [];
    }
    return [
        ...(entities.urls ?? []).map(entity => ({
            ...normalizeEntityRange(entity, offset),
            type: "url" as const,
        })),
        ...(entities.hashtags ?? []).map(entity => ({
            ...normalizeEntityRange(entity, offset),
            type: "hashtag" as const,
        })),
        ...(entities.userMentions ?? []).map(entity => ({
            ...normalizeEntityRange(entity, offset),
            type: "mention" as const,
        })),
    ];
}

function normalizeEntityRange<T extends {start: number; end: number}>(
    entity: T,
    offset: number
): T {
    return {
        ...entity,
        start: entity.start - offset,
        end: entity.end - offset,
    };
}

function entityAsHtml(text: string, entity: RenderEntity): string {
    switch (entity.type) {
        case "url": {
            const url = entity.expandedUrl || entity.url;
            const label = entity.displayUrl || url;
            return linkHtml(url, label, {softBreakSlashes: true});
        }
        case "hashtag":
            return linkHtml(
                `${TWITTER_BASE_URL}/search?q=%23${encodeURIComponent(entity.text)}`,
                text
            );
        case "mention":
            return linkHtml(`${TWITTER_BASE_URL}/${entity.username}`, text);
    }
}

function linkHtml(
    url: string,
    label: string,
    {softBreakSlashes = false}: {softBreakSlashes?: boolean} = {}
): string {
    const labelHtml = escapeHtml(label);
    return `<a href="${escapeHtmlAttribute(url)}" rel="external">${
        softBreakSlashes ? labelHtml.replaceAll("/", "/&#8203;") : labelHtml
    }</a>`;
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "").trim();
}
