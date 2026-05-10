import StatusDisplay from "$lib/components/StatusDisplay.svelte";
import StatusDisplayDebugHtml from "$lib/components/StatusDisplayDebugHtml.svelte";
import {render} from "svelte/server";
import type {Status} from ".";

export function renderFeed(
    statuses: Status[],
    metadata: FeedMetadata,
    {debug, html, includeStatusJson}: FeedOptions = {}
): FeedOutput {
    let body;
    if (html) {
        const {body: statusesHtml} = render(StatusDisplayDebugHtml, {
            props: {statuses, includeStatusJson},
        });
        body = `<!DOCTYPE html>
<html>
    <head>
    <title>${escape(metadata.title)}</title>
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
    <id>${metadata.feedUrl}</id>
    <link rel="self" href="${metadata.feedUrl}"/>
    <link rel="alternate" href="${metadata.homeUrl}" type="text/html"/>
    <title>${metadata.title}</title>
    <updated>${metadata.updatedDate}</updated>
    <author><name>${metadata.authorName}</name></author>
    ${new RawXml(statuses.map(status => renderStatus(status, includeStatusJson)).join("\n"))}
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

export type FeedMetadata = {
    feedUrl: string;
    homeUrl: string;
    title: string;
    authorName: string;
    updatedDate: Date;
};

export type FeedOptions = {
    debug?: boolean;
    html?: boolean;
    includeStatusJson?: boolean;
};

export type FeedOutput = {body: string; contentType: string};

function renderStatus(
    status: Status,
    includeStatusJson: boolean = false
): string {
    const {body: statusHtml} = render(StatusDisplay, {
        props: {status, includeStatusJson},
    });

    return xml`<entry>
        <id>${status.id}</id>
        <link rel="alternate" href="${status.permalink}" type="text/html"/>
        <title type="text">${status.titleText}</title>
        <published>${status.createdAtIso}</published>
        <updated>${status.updatedAtIso}</updated>
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
