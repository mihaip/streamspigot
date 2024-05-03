<script lang="ts">
    import {APP_NAME} from "$lib/constants";
    import Layout from "$lib/components/Layout.svelte";

    export let data;
    export let form;
</script>

<Layout title="Masto Feeder">
    <svelte:fragment slot="intro">
        <p>
            This <a href="/">{APP_NAME}</a> tool lets you subscribe to your
            Mastodon timeline and lists in a feedreader such as
            <a href="https://netnewswire.com/">NetNewsWire</a>,
            <a href="https://newsblur.com/">NewsBlur</a>,
            <a href="https://reederapp.com/">Reeder</a> or
            <a href="https://feedly.com/">Feedly</a>.
        </p>

        <p>
            By signing in with your Mastodon account, you enable Masto Feeder to
            generate feeds under "secret" URLs that will contain the statuses of
            accounts that you follow.
        </p>
    </svelte:fragment>

    {#if data.session && data.user}
        You're signed in as <a href={data.user.url}>@{data.user.username}</a>
        (
        <form action="?/sign-out" method="POST" class="inline-form">
            <button>sign out</button>
        </form>
        )

        <p>
            Your <a href={data.timelineFeedUrl} class="feed-link"
                ><b>@{data.user.username} timeline feed</b></a>
            is ready. You can subscribe to the URL in your preferred feed reader.
        </p>

        {#if form?.error}
            <p class="error">{form.error}</p>
        {/if}

        <form action="?/update-prefs" method="POST" class="prefs">
            <fieldset>
                <legend>Preferences</legend>
                <label>
                    Timezone:
                    <select name="time_zone">
                        {#each Intl.supportedValuesOf("timeZone") as timezone}
                            <option
                                value={timezone}
                                selected={timezone === data.prefs.timeZone}>
                                {timezone}
                            </option>
                        {/each}
                    </select>
                    <div class="description">
                        The timezone to use when formatting dates in the feed.
                    </div>
                </label>
                <label>
                    <input
                        type="checkbox"
                        name="use_local_urls"
                        value="true"
                        checked={data.prefs.useLocalUrls} />
                    Use local URLs
                    <div class="description">
                        Makes URLs in the feed point to your instance (instead
                        of the post author's). This may make it easier to
                        favorite, reply or boost.
                    </div>
                </label>
                <div class="buttons">
                    <input type="submit" value="Update" />
                </div>
            </fieldset>
        </form>
    {:else}
        <div class="sign-in">
            <p>
                To get started, sign in to your Mastodon instance to allow Masto
                Feeder access to your timeline and lists.
            </p>

            {#if form?.error}
                <p class="error">{form.error}</p>
            {/if}

            <form action="?/sign-in" method="POST" class="sign-in">
                <input
                    type="url"
                    name="instance_url"
                    value={form?.instance_url ?? ""}
                    placeholder="https://mastodon.social"
                    required
                    size="30" />
                <input type="submit" value="Sign In" />
            </form>
        </div>
    {/if}

    <svelte:fragment slot="footer">
        Feeds are exported under randomly-generated URLs. Though they should not
        be guessable, they may end up "leaking" if accidentally sent to someone.

        {#if data.session}
            If that happens, you may wish to <form
                action="?/reset-feed-id"
                method="POST"
                class="inline-form">
                <button>reset</button>
            </form>
            your feed URLs.
        {/if}
    </svelte:fragment>
</Layout>

<style>
    .sign-in {
        margin: 0 2em;
    }

    .sign-in form {
        display: flex;
        justify-content: center;
    }

    .sign-in form input[type="submit"] {
        margin-left: 0.5em;
    }

    .inline-form {
        display: inline;
    }

    .inline-form button {
        -webkit-appearance: none;
        appearance: none;
        border: none;
        background: none;
        padding: 0;
        color: #2db300;
        text-decoration: underline;
    }

    .feed-link {
        padding-left: 19px;
        background-position: center left;
        background-repeat: no-repeat;
        background-image: url($lib/assets/feed-icon.png);
        background-image: image-set(
            url($lib/assets/feed-icon.png) 1x,
            url($lib/assets/feed-icon@2x.png) 2x
        );
    }

    .error {
        background: #fdd;
        padding: 0.5em;
    }

    .prefs {
        margin: 1em 0;
    }

    .prefs fieldset {
        border: solid 1px #00000066;
        display: flex;
        flex-direction: column;
        gap: 1em;
    }

    .prefs .description {
        color: #666;
    }

    .prefs .buttons {
        display: flex;
        justify-content: flex-end;
    }
</style>
