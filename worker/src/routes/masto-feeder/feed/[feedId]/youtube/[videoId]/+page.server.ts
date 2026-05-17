import {MastoFeederKV} from "$lib/masto-feeder/kv";
import {WorkerKV} from "$lib/kv";
import {error} from "@sveltejs/kit";
import type {PageServerLoad} from "./$types";

export const load: PageServerLoad = async event => {
    const {params} = event;
    const {feedId, videoId} = params;

    // Validate video ID format (alphanumeric, dashes, underscores)
    if (!/^[\w-]+$/.test(videoId)) {
        return error(400, "Invalid video ID");
    }

    // Validate feed ID exists
    const mastoFeederKv = new MastoFeederKV(WorkerKV.fromEvent(event));
    const session = await mastoFeederKv.getSessionByFeedId(feedId);
    if (!session) {
        return error(404, "Unknown feed ID");
    }

    return {videoId};
};
