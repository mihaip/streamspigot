import {type mastodon} from "masto";
import * as htmlparser2 from "htmlparser2";

export class DisplayStatus {
    #status: mastodon.v1.Status;
    #env: DisplayStatusEnv;

    constructor(status: mastodon.v1.Status, env: DisplayStatusEnv) {
        this.#status = status;
        this.#env = env;
    }

    get status(): mastodon.v1.Status {
        return this.#status;
    }

    get permalinkStatus(): mastodon.v1.Status {
        return this.#status.reblog ?? this.#status;
    }

    get permalinkDisplayStatus(): DisplayStatus {
        return new DisplayStatus(this.permalinkStatus, this.#env);
    }

    get reblogDisplayStatus(): DisplayStatus | null {
        if (this.#status.reblog) {
            return new DisplayStatus(this.#status.reblog, this.#env);
        }
        return null;
    }

    get quoteDisplayStatus(): DisplayStatus | null {
        if (
            this.#status.quote &&
            "quotedStatus" in this.#status.quote &&
            this.#status.quote.quotedStatus
        ) {
            return new DisplayStatus(
                this.#status.quote.quotedStatus,
                this.#env
            );
        }
        return null;
    }

    get permalink(): string {
        if (this.#env.useLocalUrls) {
            return `${this.#env.instanceUrl}/@${this.permalinkStatus.account.acct}/${this.permalinkStatus.id}`;
        }
        return this.permalinkStatus.url ?? this.permalinkStatus.uri;
    }

    get id(): string {
        return this.permalinkStatus.uri;
    }

    get createdAt(): Date {
        return new Date(this.#status.createdAt);
    }

    get createdAtFormatted(): string {
        return new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "numeric",
            hour12: true,
            timeZone: this.#env.timeZone,
        }).format(this.createdAt);
    }

    get updatedAt(): Date {
        return new Date(this.#status.editedAt ?? this.#status.createdAt);
    }

    get titleAsText(): string {
        const truncate = (s: string) => {
            return s.length < 100 ? s : `${s.slice(0, 100)}…`;
        };

        const getStatusTitleText = (status: mastodon.v1.Status): string => {
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
        };

        const status = this.#status;
        let titleText = "";

        if (status.reblog) {
            titleText = `↺ ${displayName(status.reblog.account)}: ${getStatusTitleText(status.reblog)}`;
            if (status.reblog.poll) {
                titleText += " 📊";
            }
        } else {
            titleText = getStatusTitleText(status);
            if (status.poll) {
                titleText += " 📊";
            }
            if (
                status.quote &&
                "quotedStatus" in status.quote &&
                status.quote.quotedStatus
            ) {
                titleText += ` (quoting ${displayName(status.quote.quotedStatus?.account)})`;
            }
        }

        return `${displayName(status.account)}: ${titleText}`;
    }

    get contentAsHtml(): string {
        let html = this.#status.content;
        html = stripQuotePrefixFromContent(html);

        // Replace <p>'s with newlines so that we can avoid leading/trailing margins.
        if (html.startsWith("<p>") && html.endsWith("</p>")) {
            html = html.slice(3, -4).replaceAll("</p><p>", "<br><br>");
        }
        return html;
    }

    get parentUrl(): string {
        return this.#env.statusParentUrlGenerator(this.#status.id);
    }

    get cardIframe(): {
        url: string;
        title: string;
        width: number;
        height: number;
    } | null {
        const {card} = this.#status;
        if (!card || !["link", "video"].includes(card.type)) {
            return null;
        }

        let url: URL;
        try {
            url = new URL(card.url);
        } catch (e) {
            return null;
        }
        if (
            url.hostname === "www.youtube.com" ||
            url.hostname === "youtube.com" ||
            url.hostname === "youtu.be"
        ) {
            let videoId = extractYouTubeVideoIDFromURL(url);
            if (!videoId) {
                // Card URls sometimes end up being https://www.youtube.com/undefined
                // (see https://github.com/mastodon/mastodon/issues/31462). Fall
                // back to parsing the content and look for the YouTube links
                // ourselves.
                videoId = extractYouTubeVideoIDFromContent(
                    this.#status.content
                );
            }
            if (videoId) {
                return {
                    url: `http://www.youtube.com/embed/${videoId}`,
                    title: "YouTube Video",
                    width: 392,
                    height: 260,
                };
            }
        }

        return null;
    }

    get cardImage(): string | null {
        const {card} = this.#status;
        if (!card || !card.image) {
            return null;
        }

        const {image} = card;
        // Ignore placeholder image generated by SkyBridge
        if (image.endsWith("/1px.png") && image.includes("skybridge")) {
            return null;
        }
        return image;
    }
}

export type DisplayStatusEnv = {
    instanceUrl: string;
    timeZone: string;
    useLocalUrls: boolean;
    statusParentUrlGenerator: (statusId: string) => string;
};

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
            } catch (e) {
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
