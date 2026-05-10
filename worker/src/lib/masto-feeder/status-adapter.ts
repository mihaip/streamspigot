import type {
    Status,
    StatusAccount,
    StatusAttachment,
    StatusCard,
    StatusIframe,
    StatusPoll,
} from "$lib/status";
import {type mastodon} from "masto";
import * as htmlparser2 from "htmlparser2";

export type MastodonAdapterEnv = {
    instanceUrl: string;
    timeZone: string;
    useLocalUrls: boolean;
    statusParentUrlGenerator: (statusId: string) => string;
    youtubeEmbedUrlGenerator: (videoId: string) => string;
};

export function toStatus(
    status: mastodon.v1.Status,
    env: MastodonAdapterEnv
): Status {
    const permalinkStatus = status.reblog ?? status;
    const repostStatus = status.reblog ? toStatus(status.reblog, env) : null;

    return {
        id: permalinkStatus.uri,
        permalink: permalinkForStatus(permalinkStatus, env),
        provider: "mastodon",
        author: toStatusAccount(status.account),
        createdAtIso: new Date(status.createdAt).toISOString(),
        updatedAtIso: new Date(
            status.editedAt ?? status.createdAt
        ).toISOString(),
        createdAtLabel: formatCreatedAt(status.createdAt, env),
        titleText: titleAsText(status),
        contentHtml: contentAsHtml(status.content),
        spoilerText: status.spoilerText || undefined,
        attachments: status.mediaAttachments.map(toStatusAttachment),
        poll: status.poll ? toStatusPoll(status.poll) : null,
        card: toStatusCard(status, env),
        quote: quoteStatus(status, env),
        repost: repostStatus
            ? {
                  by: toStatusAccount(status.account),
                  status: repostStatus,
                  label: "boosted",
              }
            : null,
        applicationName: permalinkStatus.application?.name ?? null,
        parentUrl: permalinkStatus.inReplyToId
            ? env.statusParentUrlGenerator(permalinkStatus.id)
            : null,
        debugJson: status,
    };
}

export function displayName(user: mastodon.v1.Account): string {
    if (user.displayName) {
        let {displayName} = user;
        if (displayName.includes(":") && user.emojis?.length > 0) {
            for (const emoji of user.emojis) {
                displayName = displayName.replace(`:${emoji.shortcode}:`, "");
            }
        }
        return displayName;
    }
    return user.username;
}

function toStatusAccount(account: mastodon.v1.Account): StatusAccount {
    return {
        displayName: displayName(account),
        username: account.username,
        url: account.url,
        avatarUrl: account.avatar,
    };
}

function toStatusAttachment(
    attachment: mastodon.v1.MediaAttachment
): StatusAttachment {
    const url =
        attachment.remoteUrl ?? attachment.url ?? attachment.previewUrl ?? "";
    return {
        id: attachment.id,
        type: attachment.type,
        url,
        previewUrl: attachment.remoteUrl ?? attachment.previewUrl ?? undefined,
        posterUrl: attachment.previewRemoteUrl ?? undefined,
        description: attachment.description ?? attachment.type,
    };
}

function toStatusPoll(poll: mastodon.v1.Poll): StatusPoll {
    return {
        votesCount: poll.votesCount,
        options: poll.options.map(option => ({
            title: option.title,
            votesCount: option.votesCount,
        })),
    };
}

function toStatusCard(
    status: mastodon.v1.Status,
    env: MastodonAdapterEnv
): StatusCard | null {
    const {card} = status;
    const iframe = cardIframe(status, env);
    if (!card) {
        return null;
    }
    if (!iframe && !card.title) {
        return null;
    }
    return {
        url: card.url,
        title: card.title,
        description: card.description,
        imageUrl: cardImage(status),
        iframe,
    };
}

function quoteStatus(
    status: mastodon.v1.Status,
    env: MastodonAdapterEnv
): Status | null {
    if (
        status.quote &&
        "quotedStatus" in status.quote &&
        status.quote.quotedStatus
    ) {
        return toStatus(status.quote.quotedStatus, env);
    }
    return null;
}

function permalinkForStatus(
    status: mastodon.v1.Status,
    env: MastodonAdapterEnv
): string {
    if (env.useLocalUrls) {
        return `${env.instanceUrl}/@${status.account.acct}/${status.id}`;
    }
    return status.url ?? status.uri;
}

function formatCreatedAt(createdAt: string, env: MastodonAdapterEnv): string {
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
        timeZone: env.timeZone,
    }).format(new Date(createdAt));
}

function titleAsText(status: mastodon.v1.Status): string {
    let titleText: string;

    if (status.reblog) {
        titleText = `↺ ${displayName(status.reblog.account)}: ${statusTitleText(status.reblog)}`;
        if (status.reblog.poll) {
            titleText += " 📊";
        }
    } else {
        titleText = statusTitleText(status);
        if (status.poll) {
            titleText += " 📊";
        }
        if (
            status.quote &&
            "quotedStatus" in status.quote &&
            status.quote.quotedStatus
        ) {
            titleText += ` (quoting ${displayName(status.quote.quotedStatus.account)})`;
        }
    }

    return `${displayName(status.account)}: ${titleText}`;
}

function statusTitleText(status: mastodon.v1.Status): string {
    if (status.spoilerText) {
        return truncate(status.spoilerText);
    }
    if (status.text) {
        return truncate(status.text);
    }
    const text = truncate(extractTitleTextFromContent(status.content));
    if (text) {
        return text;
    }
    if (status.mediaAttachments?.length > 0) {
        const attachment = status.mediaAttachments[0];
        if (attachment.description) {
            return `[${attachment.type}: ${truncate(attachment.description)}]`;
        }
        return attachment.type;
    }
    return "";
}

function truncate(s: string): string {
    return s.length < 100 ? s : `${s.slice(0, 100)}…`;
}

function contentAsHtml(content: string): string {
    let html = stripQuotePrefixFromContent(content);

    // Replace <p>'s with newlines so that we can avoid leading/trailing margins.
    if (html.startsWith("<p>") && html.endsWith("</p>")) {
        html = html.slice(3, -4).replaceAll("</p><p>", "<br><br>");
    }
    return html;
}

function cardIframe(
    status: mastodon.v1.Status,
    env: MastodonAdapterEnv
): StatusIframe | null {
    const {card} = status;
    if (!card || !["link", "video"].includes(card.type)) {
        return null;
    }

    let url: URL;
    try {
        url = new URL(card.url);
    } catch {
        return null;
    }
    if (
        url.hostname === "www.youtube.com" ||
        url.hostname === "youtube.com" ||
        url.hostname === "youtu.be"
    ) {
        let videoId = extractYouTubeVideoIDFromURL(url);
        if (!videoId) {
            // Card URLs sometimes end up being https://www.youtube.com/undefined
            // (see https://github.com/mastodon/mastodon/issues/31462). Fall
            // back to parsing the content and look for the YouTube links
            // ourselves.
            videoId = extractYouTubeVideoIDFromContent(status.content);
        }
        if (videoId) {
            return {
                url: env.youtubeEmbedUrlGenerator(videoId),
                title: "YouTube Video",
                width: 392,
                height: 260,
            };
        }
    }

    return null;
}

function cardImage(status: mastodon.v1.Status): string | null {
    const {card} = status;
    if (!card || !card.image) {
        return null;
    }

    const {image} = card;
    // Ignore placeholder image generated by SkyBridge.
    if (image.endsWith("/1px.png") && image.includes("skybridge")) {
        return null;
    }
    return image;
}

// Gets only the first line of content as plain text.
function extractTitleTextFromContent(htmlContent: string): string {
    let accumulatedText = "";
    let afterP = false;
    const parser = new htmlparser2.Parser({
        ontext(text) {
            if (!afterP) {
                accumulatedText += text;
            }
        },
        onclosetag(tagname) {
            if (tagname === "p") {
                afterP = true;
            }
        },
    });
    parser.write(stripQuotePrefixFromContent(htmlContent));
    parser.end();

    return accumulatedText.trim();
}

function stripQuotePrefixFromContent(html: string): string {
    // Strip quote prefix inserted into the content for backwards compatibility
    // (see https://docs.joinmastodon.org/methods/statuses/)
    const quoteRE =
        /^<p class="quote-inline">\s*RE:\s*<a\b[^>]*>(?:(?!<\/a><\/p>)[\s\S])*?<\/a><\/p>\s*/i;
    return html.replace(quoteRE, "");
}

function extractYouTubeVideoIDFromContent(
    htmlContent: string
): string | undefined {
    let videoId: string | undefined;
    const parser = new htmlparser2.Parser({
        onopentag(name, attribs) {
            if (name !== "a" || !attribs.href) {
                return;
            }
            let url: URL;
            try {
                url = new URL(attribs.href);
            } catch {
                return;
            }

            const linkVideoId = extractYouTubeVideoIDFromURL(url);
            if (linkVideoId) {
                videoId = linkVideoId;
            }
        },
    });
    parser.write(htmlContent);
    parser.end();
    return videoId;
}

function extractYouTubeVideoIDFromURL(url: URL): string | undefined {
    if (
        (url.hostname === "www.youtube.com" ||
            url.hostname === "youtube.com") &&
        url.pathname === "/watch"
    ) {
        const videoIdParam = url.searchParams.get("v");
        if (videoIdParam) {
            return videoIdParam;
        }
    }
    if (url.hostname === "youtu.be") {
        return url.pathname.slice(1);
    }
    return undefined;
}
