import type {PageServerLoad} from "./$types";

export const load: PageServerLoad = ({url}) => ({
    searchFeedBaseUrl: `${url.origin}/tweeter-feeder/feed/search`,
    searchQuery: url.searchParams.get("q") ?? "",
});
