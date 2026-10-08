<script lang="ts">
    import {resolve} from "$app/paths";
    import {APP_NAME} from "$lib/constants";
    import FeedLink from "$lib/components/FeedLink.svelte";
    import Layout from "$lib/components/Layout.svelte";
    import SearchFeedSetup from "$lib/components/SearchFeedSetup.svelte";
    import type {PageData} from "./$types";

    let {data}: {data: PageData} = $props();

    const TWITTER_USERNAME_RE = /^[a-zA-Z0-9_]{1,15}$/;
    const MAX_USERNAMES = 10;

    let rows = $state([""]);
    let excludeRetweets = $state(false);

    let rawUsernames = $derived(
        rows.map(row => row.trim().replace(/^@/, "")).filter(Boolean)
    );
    let invalidUsernames = $derived(
        rawUsernames.filter(username => !TWITTER_USERNAME_RE.test(username))
    );
    let usernames = $derived(dedupe(rawUsernames.map(u => u.toLowerCase())));
    let hasUsernames = $derived(usernames.length > 0);
    let hasErrors = $derived(invalidUsernames.length > 0);
    let feedHref = $derived(feedUrl(usernames));
    let jsonFeedHref = $derived(feedUrl(usernames, "json"));
    let feedTitle = $derived(
        `${usernames.map(username => `@${username}`).join(", ")} feed`
    );

    function addRow(index: number) {
        if (rows.length >= MAX_USERNAMES) {
            return;
        }
        rows.splice(index + 1, 0, "");
    }

    function removeRow(index: number) {
        if (rows.length === 1) {
            return;
        }
        rows.splice(index, 1);
    }

    function handleKeydown(event: KeyboardEvent, index: number) {
        if (event.key === "Enter") {
            event.preventDefault();
            addRow(index);
        }
    }

    function dedupe(values: string[]): string[] {
        const result: string[] = [];
        for (const value of values) {
            if (!result.includes(value)) {
                result.push(value);
            }
        }
        return result;
    }

    function feedUrl(usernames: string[], output?: "json"): string {
        const params = [`usernames=${usernames.join("+")}`];
        if (excludeRetweets) {
            params.push("excludeRetweets=true");
        }
        if (output) {
            params.push(`output=${output}`);
        }
        return `${resolve("/tweeter-feeder/feed")}?${params.join("&")}`;
    }
</script>

<Layout title="Tweeter Feeder">
    {#snippet intro()}
        <p>
            This <a href={resolve("/")}>{APP_NAME}</a> tool lets you subscribe
            to posts from public <a href="https://twitter.com">Twitter</a>
            accounts and search results in a feed reader. Enter one or more usernames
            below and use the generated feed URL.
        </p>

        <p>
            Tweeter Feeder does not sign in to your Twitter account. It can only
            read public accounts, and it depends on private web endpoints, which
            may change at any time.
        </p>
    {/snippet}

    <div class="setup">
        <fieldset>
            <legend>Twitter usernames</legend>
            <div class="usernames">
                {#each rows as username, index (index)}
                    <div class="row">
                        <input
                            type="text"
                            class:error={username &&
                                !TWITTER_USERNAME_RE.test(
                                    username.trim().replace(/^@/, "")
                                )}
                            bind:value={rows[index]}
                            onkeydown={event => handleKeydown(event, index)}
                            placeholder="Username"
                            aria-label="Twitter username" />
                        <button
                            type="button"
                            onclick={() => removeRow(index)}
                            disabled={rows.length === 1}
                            aria-label="Remove username">-</button>
                        <button
                            type="button"
                            onclick={() => addRow(index)}
                            disabled={rows.length >= MAX_USERNAMES}
                            aria-label="Add username">+</button>
                    </div>
                {/each}
            </div>
        </fieldset>
    </div>

    {#if hasErrors}
        <p class="error-message">
            "{invalidUsernames.join('", "')}" {invalidUsernames.length === 1
                ? "is an invalid Twitter username"
                : "are invalid Twitter usernames"}.
        </p>
    {:else if hasUsernames}
        <p>
            Your <FeedLink href={feedHref} target="_blank"
                ><b>{feedTitle}</b></FeedLink>
            is ready (also available as <FeedLink
                href={jsonFeedHref}
                feedType="json"
                target="_blank">a JSON Feed</FeedLink
            >). You can subscribe to the URL in your preferred feed reader.
        </p>

        <fieldset class="options">
            <legend>Options</legend>
            <label>
                <input type="checkbox" bind:checked={excludeRetweets} />
                Exclude retweets
            </label>
        </fieldset>
    {/if}

    <section class="search-feeds">
        <SearchFeedSetup
            feedBaseUrl={data.searchFeedBaseUrl}
            canSearch={true}
            query={data.searchQuery}>
            {#snippet help()}
                Use keywords, <code>"a phrase"</code>, <code>#hashtags</code>,
                <code>from:username</code>, or <code>-excluded</code> words. See
                Twitter's
                <a
                    href="https://docs.x.com/x-api/posts/search/integrate/operators"
                    >search operator reference</a> for more options.
            {/snippet}
        </SearchFeedSetup>
    </section>

    {#snippet footer()}
        <p>
            Keep in mind that feeds can only be created for public accounts.
            Feed URLs include the selected usernames or search query, so anyone
            with the URL can see what it follows.
        </p>
    {/snippet}
</Layout>

<style>
    .setup {
        display: grid;
        justify-content: center;
    }

    .setup fieldset {
        border: none;
        min-width: 250px;
        text-align: center;
    }

    .setup legend {
        color: #333;
        padding: 0 1em;
        text-align: center;
    }

    .row {
        margin: 0.2em 0;
        white-space: nowrap;
    }

    .options {
        margin: 1em 0;
        border: solid 1px #00000066;
        display: flex;
        flex-direction: column;
        gap: 1em;
    }

    .options label {
        display: inline-flex;
        align-items: center;
        gap: 0.4em;
    }

    input.error {
        background: #fdd;
    }

    button {
        border: 0;
        background: #eee;
        font-weight: bold;
        width: 1.6em;
        text-align: center;
        height: 1.7em;
        padding: 0 0.1em 0.1em 0.1em;
        color: #8aa7ff;
        cursor: pointer;
    }

    button[disabled] {
        opacity: 0.3;
        cursor: default;
    }

    .error-message {
        background: #fdd;
        padding: 0.5em;
    }
</style>
