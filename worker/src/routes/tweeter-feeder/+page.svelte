<script lang="ts">
    import {resolve} from "$app/paths";
    import {APP_NAME} from "$lib/constants";
    import FeedLink from "$lib/components/FeedLink.svelte";
    import Layout from "$lib/components/Layout.svelte";

    const TWITTER_USERNAME_RE = /^[a-zA-Z0-9_]{1,15}$/;
    const MAX_USERNAMES = 10;

    let rows = $state([""]);

    let rawUsernames = $derived(
        rows.map(row => row.trim().replace(/^@/, "")).filter(Boolean)
    );
    let invalidUsernames = $derived(
        rawUsernames.filter(username => !TWITTER_USERNAME_RE.test(username))
    );
    let usernames = $derived(dedupe(rawUsernames.map(u => u.toLowerCase())));
    let hasUsernames = $derived(usernames.length > 0);
    let hasErrors = $derived(invalidUsernames.length > 0);
    let feedHref = $derived(
        `${resolve("/tweeter-feeder/feed")}?usernames=${usernames.join("+")}`
    );
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
</script>

<Layout title="Tweeter Feeder">
    {#snippet intro()}
        <p>
            This <a href={resolve("/")}>{APP_NAME}</a> tool lets you subscribe
            to posts from public <a href="https://twitter.com">Twitter/X</a>
            accounts in a feed reader. Enter one or more usernames below and use
            the generated feed URL.
        </p>

        <p>
            Tweeter Feeder does not sign in to your Twitter account. It can only
            read public accounts, and X/Twitter access may be less reliable than
            Mastodon because it depends on private web endpoints.
        </p>
    {/snippet}

    <div class="symbol">&#8675;</div>

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
        <div class="digest-message error-message">
            <div class="symbol">&empty;</div>
            <div class="inner">
                "{invalidUsernames.join('", "')}" {invalidUsernames.length === 1
                    ? "is an invalid Twitter username"
                    : "are invalid Twitter usernames"}.
            </div>
        </div>
    {:else if hasUsernames}
        <div class="digest-message">
            <div class="symbol">&#8675;</div>
            <div class="inner">
                Your <FeedLink
                    href={feedHref}
                    target="_blank"
                    rel="external"><b>{feedTitle}</b></FeedLink>
                is ready. You can subscribe to the URL in your preferred feed
                reader.
            </div>
        </div>
    {:else}
        <div class="digest-message error-message">
            <div class="symbol">&empty;</div>
            <div class="inner">
                You must enter at least one Twitter username to create a feed.
            </div>
        </div>
    {/if}

    {#snippet footer()}
        <p>
            Keep in mind that feeds can only be created for public accounts.
            Feed URLs include the selected usernames, so anyone with the URL can
            see which accounts it follows.
        </p>
    {/snippet}
</Layout>

<style>
    .symbol {
        color: #333;
        font-weight: bold;
        font-size: 200%;
        margin: 0;
        padding: 0.1em;
        height: 1.5em;
        text-align: center;
    }

    .setup {
        display: flex;
        justify-content: center;
    }

    fieldset {
        border-width: 1px 0 0 0;
        border-color: #9bb9ff;
        border-style: solid;
        min-width: 250px;
        text-align: center;
    }

    legend {
        color: #333;
        padding: 0 1em;
        text-align: center;
    }

    .row {
        margin: 0.2em 0;
        white-space: nowrap;
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

    .digest-message {
        margin-top: 1em;
        text-align: center;
    }

    .error-message .symbol {
        color: red;
    }

</style>
