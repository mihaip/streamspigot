import {APP_NAME} from "$lib/constants";
import {createRestAPIClient} from "$lib/masto";
import type {MastoFeederSession} from "./types";
import MastodonStatus from "$lib/components/MastodonStatus.svelte";
import {DisplayStatus, type DisplayStatusEnv} from "./display-status";
import {renderToHtml} from "$lib/svelte";
import MastodonDebugHtml from "$lib/components/MastodonDebugHtml.svelte";

export type FeedOptions = {
    debug?: boolean;
    html?: boolean;
    includeStatusJson?: boolean;
};

export type FeedOutput = {
    body: string;
    contentType: string;
};

export async function renderTimelineFeed(
    session: MastoFeederSession,
    feedUrl: string,
    homeUrl: string,
    env: DisplayStatusEnv,
    {debug, html, includeStatusJson}: FeedOptions = {}
): Promise<FeedOutput> {
    const masto = createRestAPIClient({
        url: session.instanceUrl,
        accessToken: session.accessToken,
    });
    const user = await masto.v1.accounts.verifyCredentials();
    const title = `@${user.username} Timeline`;

    const updatedDate = new Date();
    // We could put in a per-status author name with the post author's screen name,
    // but that would just duplicate information in the body. By only having a
    // feed-level author, the feed is still valid, but feed readers won't display
    // a per-post author line.
    const authorName = `${APP_NAME} : Masto Feeder`;

    // Include items from the past 12 hours, which should be enough to cover
    // most federation delays.
    const limitTime = Date.now() - 12 * 60 * 60 * 1000;
    let maxId = undefined;
    const statuses = [];
    const statusIds = new Set();
    while (true) {
        const chunkStatuses = await masto.v1.timelines.home.list({
            limit: debug ? 10 : 40,
            maxId,
        });
        const newChunkStatuses = chunkStatuses.filter(
            s =>
                new Date(s.createdAt).getTime() >= limitTime &&
                !statusIds.has(s.id)
        );
        if (newChunkStatuses.length === 0) {
            break;
        }
        statuses.push(...newChunkStatuses);
        // Ensure that we don't get stuck in a loop if the server returns
        // the same chunk over and over again (which Sky Bridge appears to).
        for (const s of newChunkStatuses) {
            statusIds.add(s.id);
        }
        maxId = newChunkStatuses.at(-1)!.id;
        if (debug) {
            break;
        }
    }

    const displayStatuses = statuses.map(
        status => new DisplayStatus(status, env)
    );

    let body;
    if (html) {
        const {html: statusesHtml} = renderToHtml(MastodonDebugHtml, {
            displayStatuses,
            includeStatusJson,
        });
        body = `<!DOCTYPE html>
<html>
    <head>
    <title>${escape(title)}</title>
    <style>
    /* Simulate some styles that NetNewsWire injects, to make testing easier */
    img.nnw-nozoom {
        max-width: 100%;
    }
    a {
        text-decoration: underline;
        text-decoration-color: blue;
        text-decoration-thickness: 1px;
        text-underline-offset: 2px;
    }
    </style>
    </head>
    <body>${statusesHtml}</body>
</html>`;
    } else {
        body = xml`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
    <id>${feedUrl}</id>
    <link rel="self" href="${feedUrl}"/>
    <link rel="alternate" href="${homeUrl}" type="text/html"/>
    <title>${title}</title>
    <updated>${updatedDate}</updated>
    <author><name>${authorName}</name></author>
    ${new RawXml(displayStatuses.map(displayStatus => renderStatus(displayStatus, includeStatusJson)).join("\n"))}
</feed>
`;
    }

    let contentType;
    if (html) {
        contentType = "text/html";
    } else if (debug) {
        // text/xml is pretty-printed and thus easier to see
        contentType = "text/xml";
    } else {
        contentType = "application/atom+xml";
    }

    return {body, contentType};
}

function renderStatus(
    displayStatus: DisplayStatus,
    includeStatusJson: boolean = false
): string {
    const {html: statusHtml} = renderToHtml(MastodonStatus, {
        displayStatus,
        includeStatusJson,
    });

    return xml`<entry>
        <id>${displayStatus.id}</id>
        <link rel="alternate" href="${displayStatus.permalink}" type="text/html"/>
        <title type="text">${displayStatus.titleAsText}</title>
        <published>${displayStatus.createdAt}</published>
        <updated>${displayStatus.updatedAt}</updated>
        <content type="html">
            ${statusHtml}
        </content>
    </entry>`;
}

function xml(strings: TemplateStringsArray, ...values: unknown[]): string {
    let result = "";
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < values.length) {
            let value = values[i];
            if (value instanceof RawXml) {
                // Use the raw XML string as-is.
            } else if (value instanceof Date) {
                value = value.toISOString();
            } else {
                value = escape(String(value));
            }
            result += value;
        }
    }
    return result;
}

class RawXml extends String {}

function escape(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
