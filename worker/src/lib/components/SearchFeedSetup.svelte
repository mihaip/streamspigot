<script lang="ts">
    import {tick, type Snippet} from "svelte";
    import {
        MAX_SEARCH_QUERY_LENGTH,
        searchFeedUrl,
        searchQueryError,
    } from "$lib/feeder/search";
    import FeedLink from "./FeedLink.svelte";

    let {
        feedBaseUrl,
        canSearch,
        query = "",
        help,
    }: {
        feedBaseUrl: string;
        canSearch: boolean;
        query?: string;
        help?: Snippet;
    } = $props();

    let expanded = $state(false);
    let queryInput: HTMLInputElement | undefined = $state();
    let inputQuery = $derived(query);
    let trimmedQuery = $derived(inputQuery.trim());
    let error = $derived(trimmedQuery ? searchQueryError(trimmedQuery) : null);
    let atomUrl = $derived(searchFeedUrl(feedBaseUrl, trimmedQuery));
    let jsonUrl = $derived(searchFeedUrl(feedBaseUrl, trimmedQuery, "json"));

    async function revealSearch() {
        expanded = true;
        await tick();
        queryInput?.focus();
    }
</script>

<div class="intro">
    You can also
    {#if !canSearch}
        <form action="?/enable-search" method="POST" class="inline-form">
            <button class="setup-link">set up feeds</button>
        </form>
    {:else if expanded}
        set up feeds
    {:else}
        <button
            type="button"
            class="setup-link"
            aria-expanded="false"
            aria-controls="search-setup"
            onclick={revealSearch}>set up feeds</button>
    {/if}
    for search results.
</div>

{#if canSearch && expanded}
    <div id="search-setup" class="setup">
        <input
            id="search-query"
            type="text"
            name="q"
            aria-label="Search query"
            aria-describedby="search-help"
            bind:this={queryInput}
            bind:value={inputQuery}
            maxlength={MAX_SEARCH_QUERY_LENGTH}
            placeholder="Keywords, a phrase, or a hashtag" />
        <div id="search-help" class="help">{@render help?.()}</div>
    </div>

    {#if error}
        <p class="error" role="alert">{error}</p>
    {:else if trimmedQuery}
        <p>
            Your <FeedLink href={atomUrl}
                ><b>"{trimmedQuery}" search feed</b></FeedLink>
            is ready (also available as <FeedLink href={jsonUrl} feedType="json"
                >a JSON Feed</FeedLink
            >).
        </p>
    {/if}
{/if}

<style>
    .intro {
        margin: 1em 0;
    }

    .inline-form {
        display: inline;
    }

    .setup-link {
        appearance: none;
        border: none;
        background: none;
        padding: 0;
        font: inherit;
        color: #2db300;
        text-decoration: underline;
        cursor: pointer;
    }

    .setup {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75em;
    }

    .setup input {
        width: 100%;
        box-sizing: border-box;
        padding: 0.5em;
        font-size: inherit;
    }

    .help {
        color: #666;
    }

    .error {
        background: #fdd;
        padding: 0.5em;
    }
</style>
