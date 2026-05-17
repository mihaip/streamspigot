import {error, type RequestEvent} from "@sveltejs/kit";
import {WorkerKV} from "$lib/kv";
import {type FeedOptions, type FeedOutputType} from "$lib/status/feed";
import {TweeterFeederKV} from "./kv";
import {
    fetchErrorForUsername,
    isValidTwitterUsername,
    parseUsernames,
} from "./fetcher";
import {TwitterFetcher} from "./fetcher";
import {renderTweeterFeed} from "./feed";

const MAX_USERNAMES = 10;

export class TweeterFeederController {
    #kv: TweeterFeederKV;
    #appProtocol: string;
    #appHost: string;

    constructor(event: RequestEvent) {
        const {url} = event;
        this.#kv = new TweeterFeederKV(WorkerKV.fromEvent(event));
        this.#appProtocol = url.protocol;
        this.#appHost = url.host;
    }

    async handleFeed(
        usernamesParam: string | null,
        options: FeedOptions
    ): Promise<Response> {
        const usernames = parseUsernames(usernamesParam);
        const validationError = validateUsernames(usernames);
        if (validationError) {
            return error(400, validationError);
        }

        const count = options.debug ? 5 : 20;
        const sessions = await this.#kv.getSessions();
        const fetcher = new TwitterFetcher(this.#kv, sessions);
        const results = [];
        const errors = [];
        for (const username of usernames) {
            try {
                results.push(await fetcher.fetchTimeline(username, count));
            } catch (e) {
                const fetchError = fetchErrorForUsername(username, e);
                console.warn("Tweeter Feeder username fetch failed", {
                    username,
                    message: fetchError.message,
                });
                errors.push(fetchError);
            }
        }

        const tweets = results.flatMap(result => result.tweets);
        if (tweets.length === 0 && errors.length > 0) {
            const message = `Could not fetch Twitter/X timelines: ${errors
                .map(e => `@${e.username}: ${e.message}`)
                .join("; ")}`;
            console.error("Tweeter Feeder all username fetches failed", {
                message,
            });
            return error(502, message);
        }

        const {body, contentType} = renderTweeterFeed(
            usernames,
            results,
            errors,
            this.feedUrl(usernames, options.output),
            this.#baseUrl(),
            options
        );
        const encodedBody = new TextEncoder().encode(body);
        return new Response(encodedBody, {
            headers: {
                "Content-Type": `${contentType}; charset=utf-8`,
            },
        });
    }

    feedUrl(usernames: string[], output?: FeedOutputType): string {
        const url = `${this.#baseUrl()}/feed?usernames=${usernames.join("+")}`;
        if (output && output !== "atom") {
            return `${url}&output=${output}`;
        }
        return url;
    }

    #baseUrl(): string {
        return `${this.#appProtocol}//${this.#appHost}/tweeter-feeder`;
    }
}

function validateUsernames(usernames: string[]): string | null {
    if (usernames.length === 0) {
        return 'Must provide at least one username in the "usernames" parameter';
    }
    if (usernames.length > MAX_USERNAMES) {
        return `At most ${MAX_USERNAMES} usernames can be requested`;
    }
    const invalidUsername = usernames.find(
        username => !isValidTwitterUsername(username)
    );
    if (invalidUsername) {
        return `${invalidUsername} is an invalid Twitter username`;
    }
    return null;
}
