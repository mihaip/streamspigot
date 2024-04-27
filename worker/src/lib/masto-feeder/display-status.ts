import {type mastodon} from "masto";
import * as htmlparser2 from "htmlparser2";

export class DisplayStatus {
    #status: mastodon.v1.Status;

    constructor(status: mastodon.v1.Status) {
        this.#status = status;
    }

    get status(): mastodon.v1.Status {
        return this.#status;
    }

    get permalinkStatus(): mastodon.v1.Status {
        return this.#status.reblog ?? this.#status;
    }

    get reblogDisplayStatus(): DisplayStatus | null {
        if (this.#status.reblog) {
            return new DisplayStatus(this.#status.reblog);
        }
        return null;
    }

    get permalink(): string {
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
            timeZone: "America/Los_Angeles",
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
        }

        return `${displayName(status.account)}: ${titleText}`;
    }

    get contentAsHtml(): string {
        return this.#status.content;
    }
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
    parser.write(htmlContent);
    parser.end();

    return accumulatedText.trim();
}
