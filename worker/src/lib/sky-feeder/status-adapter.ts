import type {
    Status,
    StatusAccount,
    StatusAttachment,
    StatusCard,
} from "$lib/status";
import {escapeHtml, escapeHtmlAttribute} from "$lib/html";
import {truncate} from "$lib/strings";
import {
    AppBskyEmbedExternal,
    AppBskyEmbedImages,
    AppBskyEmbedRecord,
    AppBskyEmbedRecordWithMedia,
    AppBskyEmbedVideo,
    AppBskyFeedDefs,
    AppBskyFeedPost,
    AppBskyRichtextFacet,
    ComAtprotoLabelDefs,
} from "@atproto/api";

const BLUESKY_APP_URL = "https://bsky.app";

export type BlueskyAdapterEnv = {
    timeZone: string;
};

export function toStatus(
    feedPost: AppBskyFeedDefs.FeedViewPost,
    env: BlueskyAdapterEnv
): Status {
    const repostReason = AppBskyFeedDefs.isReasonRepost(feedPost.reason)
        ? feedPost.reason
        : null;
    const originalStatus = {
        ...toStatusFromPost(feedPost.post, env),
        parentUrl: parentUrl(feedPost),
    };
    if (!repostReason) {
        return originalStatus;
    }

    return {
        ...originalStatus,
        id: `${feedPost.post.uri}#repost:${repostReason.by.did}:${repostReason.indexedAt}`,
        author: toStatusAccount(repostReason.by),
        createdAtIso: new Date(repostReason.indexedAt).toISOString(),
        updatedAtIso: new Date(repostReason.indexedAt).toISOString(),
        createdAtLabel: formatCreatedAt(repostReason.indexedAt, env),
        titleText: `${displayName(repostReason.by)}: ↺ ${originalStatus.headlineText}`,
        headlineText: `↺ ${originalStatus.headlineText}`,
        contentHtml: "",
        attachments: [],
        poll: null,
        card: null,
        quote: null,
        repost: {
            by: toStatusAccount(repostReason.by),
            status: originalStatus,
            label: "reposted",
        },
        parentUrl: null,
        debugJson: feedPost,
    };
}

function toStatusFromPost(
    post: AppBskyFeedDefs.PostView,
    env: BlueskyAdapterEnv
): Status {
    const record = asPostRecord(post.record);
    const createdAt = record?.createdAt ?? post.indexedAt;
    const contentHtml = record
        ? textWithFacetsAsHtml(record.text, record.facets)
        : "";
    const quote = quoteFromEmbed(post.embed, env);
    const headlineText = headlineAsText(record?.text ?? "", quote);

    return {
        id: post.uri,
        permalink: postUrl(post.uri, post.author.handle),
        provider: "bluesky",
        author: toStatusAccount(post.author),
        createdAtIso: new Date(createdAt).toISOString(),
        updatedAtIso: new Date(post.indexedAt).toISOString(),
        createdAtLabel: formatCreatedAt(createdAt, env),
        titleText: `${displayName(post.author)}: ${headlineText}`,
        headlineText,
        contentHtml,
        spoilerText: record ? selfLabelSpoiler(record.labels) : undefined,
        attachments: attachmentsFromEmbed(post.embed),
        poll: null,
        card: cardFromEmbed(post.embed),
        quote,
        repost: null,
        applicationName: null,
        parentUrl: null,
        debugJson: post,
    };
}

function toStatusFromRecordView(
    recordView: AppBskyEmbedRecord.ViewRecord,
    env: BlueskyAdapterEnv
): Status {
    const record = asPostRecord(recordView.value);
    const createdAt = record?.createdAt ?? recordView.indexedAt;
    const contentHtml = record
        ? textWithFacetsAsHtml(record.text, record.facets)
        : "";
    const quote = quoteFromEmbeds(recordView.embeds ?? [], env);
    const headlineText = headlineAsText(record?.text ?? "", quote);

    return {
        id: recordView.uri,
        permalink: postUrl(recordView.uri, recordView.author.handle),
        provider: "bluesky",
        author: toStatusAccount(recordView.author),
        createdAtIso: new Date(createdAt).toISOString(),
        updatedAtIso: new Date(recordView.indexedAt).toISOString(),
        createdAtLabel: formatCreatedAt(createdAt, env),
        titleText: `${displayName(recordView.author)}: ${headlineText}`,
        headlineText,
        contentHtml,
        spoilerText: record ? selfLabelSpoiler(record.labels) : undefined,
        attachments: attachmentsFromEmbeds(recordView.embeds ?? []),
        poll: null,
        card: cardFromEmbeds(recordView.embeds ?? []),
        quote,
        repost: null,
        applicationName: null,
        parentUrl: null,
        debugJson: recordView,
    };
}

function toStatusAccount(
    account: AppBskyFeedDefs.PostView["author"]
): StatusAccount {
    return {
        displayName: displayName(account),
        username: account.handle,
        url: `${BLUESKY_APP_URL}/profile/${account.handle || account.did}`,
        avatarUrl: account.avatar ?? "",
    };
}

function displayName(account: AppBskyFeedDefs.PostView["author"]): string {
    return account.displayName || account.handle;
}

type BlueskyPostRecord = {
    text: string;
    createdAt: string;
    facets?: AppBskyRichtextFacet.Main[];
    labels?: AppBskyFeedPost.Main["labels"];
};

function asPostRecord(record: unknown): BlueskyPostRecord | null {
    if (
        !record ||
        typeof record !== "object" ||
        !("$type" in record) ||
        record.$type !== "app.bsky.feed.post" ||
        !("text" in record) ||
        typeof record.text !== "string" ||
        !("createdAt" in record) ||
        typeof record.createdAt !== "string"
    ) {
        return null;
    }
    return record as BlueskyPostRecord;
}

function postUrl(uri: string, handle: string): string {
    const rkey = uri.split("/").at(-1);
    return `${BLUESKY_APP_URL}/profile/${handle}/post/${rkey}`;
}

function parentUrl(feedPost: AppBskyFeedDefs.FeedViewPost): string | null {
    const parent = feedPost.reply?.parent;
    if (!AppBskyFeedDefs.isPostView(parent)) {
        return null;
    }
    return postUrl(parent.uri, parent.author.handle);
}

function formatCreatedAt(createdAt: string, env: BlueskyAdapterEnv): string {
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
        timeZone: env.timeZone,
    }).format(new Date(createdAt));
}

function headlineAsText(text: string, quote: Status | null): string {
    let headline = truncate(text.replace(/\s+/g, " ").trim());
    if (!headline) {
        headline = quote ? `Quoting ${quote.author.username}` : "Bluesky post";
    } else if (quote) {
        headline += ` (quoting ${quote.author.username})`;
    }
    return headline;
}

function textWithFacetsAsHtml(
    text: string,
    facets: AppBskyRichtextFacet.Main[] | undefined
): string {
    const bytes = new TextEncoder().encode(text);
    const decoder = new TextDecoder();
    const renderFacets = (facets ?? [])
        .filter(facet => facet.index.byteEnd > facet.index.byteStart)
        .sort((a, b) => a.index.byteStart - b.index.byteStart);

    let result = "";
    let cursor = 0;
    for (const facet of renderFacets) {
        const start = Math.max(0, facet.index.byteStart);
        const end = Math.min(bytes.length, facet.index.byteEnd);
        if (start < cursor || end <= start) {
            continue;
        }
        result += escapeHtml(decoder.decode(bytes.slice(cursor, start)));
        result += facetAsHtml(decoder.decode(bytes.slice(start, end)), facet);
        cursor = end;
    }
    result += escapeHtml(decoder.decode(bytes.slice(cursor)));
    return result.replace(/\n/g, "<br />");
}

function facetAsHtml(text: string, facet: AppBskyRichtextFacet.Main): string {
    const feature = facet.features.find(
        f =>
            AppBskyRichtextFacet.isLink(f) ||
            AppBskyRichtextFacet.isMention(f) ||
            AppBskyRichtextFacet.isTag(f)
    );
    if (!feature) {
        return escapeHtml(text);
    }

    let href: string | null = null;
    if (AppBskyRichtextFacet.isLink(feature)) {
        href = safeFacetHref(feature.uri);
    } else if (AppBskyRichtextFacet.isMention(feature)) {
        href = `${BLUESKY_APP_URL}/profile/${feature.did}`;
    } else if (AppBskyRichtextFacet.isTag(feature)) {
        href = `${BLUESKY_APP_URL}/hashtag/${encodeURIComponent(feature.tag)}`;
    }

    return href
        ? `<a href="${escapeHtmlAttribute(href)}" rel="external">${escapeHtml(text)}</a>`
        : escapeHtml(text);
}

function safeFacetHref(uri: string): string | null {
    try {
        const url = new URL(uri);
        return url.protocol === "http:" || url.protocol === "https:"
            ? url.toString()
            : null;
    } catch {
        return null;
    }
}

function attachmentsFromEmbed(
    embed: AppBskyFeedDefs.PostView["embed"] | undefined
): StatusAttachment[] {
    return attachmentsFromEmbeds(embed ? [embed] : []);
}

function attachmentsFromEmbeds(
    embeds: NonNullable<AppBskyEmbedRecord.ViewRecord["embeds"]>
): StatusAttachment[] {
    const attachments: StatusAttachment[] = [];
    for (const embed of embeds) {
        if (AppBskyEmbedImages.isView(embed)) {
            attachments.push(...embed.images.map(toImageAttachment));
        } else if (AppBskyEmbedVideo.isView(embed)) {
            attachments.push(toVideoAttachment(embed));
        } else if (AppBskyEmbedRecordWithMedia.isView(embed)) {
            attachments.push(...attachmentsFromEmbeds([embed.media]));
        }
    }
    return attachments;
}

function toImageAttachment(
    image: AppBskyEmbedImages.ViewImage
): StatusAttachment {
    return {
        id: image.fullsize,
        type: "image",
        url: image.fullsize,
        previewUrl: image.thumb,
        description: image.alt || "image",
    };
}

function toVideoAttachment(video: AppBskyEmbedVideo.View): StatusAttachment {
    return {
        id: video.cid,
        type: video.presentation === "gif" ? "gifv" : "video",
        url: video.playlist,
        previewUrl: video.thumbnail,
        posterUrl: video.thumbnail,
        description: video.alt || "video",
    };
}

function cardFromEmbed(
    embed: AppBskyFeedDefs.PostView["embed"] | undefined
): StatusCard | null {
    return cardFromEmbeds(embed ? [embed] : []);
}

function cardFromEmbeds(
    embeds: NonNullable<AppBskyEmbedRecord.ViewRecord["embeds"]>
): StatusCard | null {
    for (const embed of embeds) {
        if (AppBskyEmbedExternal.isView(embed)) {
            return {
                url: embed.external.uri,
                title: embed.external.title,
                description: embed.external.description,
                imageUrl: embed.external.thumb,
            };
        }
        if (AppBskyEmbedRecordWithMedia.isView(embed)) {
            const card = cardFromEmbeds([embed.media]);
            if (card) {
                return card;
            }
        }
    }
    return null;
}

function quoteFromEmbed(
    embed: AppBskyFeedDefs.PostView["embed"] | undefined,
    env: BlueskyAdapterEnv
): Status | null {
    return quoteFromEmbeds(embed ? [embed] : [], env);
}

function quoteFromEmbeds(
    embeds: NonNullable<AppBskyEmbedRecord.ViewRecord["embeds"]>,
    env: BlueskyAdapterEnv
): Status | null {
    for (const embed of embeds) {
        if (AppBskyEmbedRecord.isView(embed)) {
            const quote = quoteFromRecordView(embed.record, env);
            if (quote) {
                return quote;
            }
        } else if (AppBskyEmbedRecordWithMedia.isView(embed)) {
            const quote = quoteFromRecordView(embed.record.record, env);
            if (quote) {
                return quote;
            }
        }
    }
    return null;
}

function quoteFromRecordView(
    record:
        | AppBskyEmbedRecord.View["record"]
        | AppBskyEmbedRecordWithMedia.View["record"]["record"],
    env: BlueskyAdapterEnv
): Status | null {
    return AppBskyEmbedRecord.isViewRecord(record)
        ? toStatusFromRecordView(record, env)
        : null;
}

function selfLabelSpoiler(
    labels: AppBskyFeedPost.Main["labels"] | undefined
): string | undefined {
    if (
        !ComAtprotoLabelDefs.isSelfLabels(labels) ||
        labels.values.length === 0
    ) {
        return undefined;
    }
    return labels.values.map(label => label.val).join(", ");
}
