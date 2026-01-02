import {MastoFeederKV} from "$lib/masto-feeder/kv";
import {WorkerKV} from "$lib/kv";
import {error} from "@sveltejs/kit";
import type {PageServerLoad} from "./$types";

export const load: PageServerLoad = async ({params, platform}) => {
    const {feedId, videoId} = params;

    // Validate video ID format (alphanumeric, dashes, underscores)
    if (!/^[\w-]+$/.test(videoId)) {
        return error(400, "Invalid video ID");
    }

    // Validate feed ID exists
    const kv = platform?.env?.MASTOFEEDER;
    if (!kv) {
        return error(500, "KV not available");
    }
    const mastoFeederKv = new MastoFeederKV(new WorkerKV(kv));
    const session = await mastoFeederKv.getSessionByFeedId(feedId);
    if (!session) {
        return error(404, "Unknown feed ID");
    }

    return {videoId};
};
