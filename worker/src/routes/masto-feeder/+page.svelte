<script lang="ts">
    import {APP_NAME} from "$lib/constants";
    import Layout from "$lib/components/Layout.svelte";
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
            accounts that you follow or have in a list.
        </p>
    </svelte:fragment>

    <p>
        To get started, sign in to your Mastodon instance to allow Masto Feeder
        access to your timeline and lists.
    </p>

    <form method="POST" class="sign-in">
        <input
            type="url"
            name="instance_url"
            placeholder="https://mastodon.social"
            required
            size="30" />
        <input type="submit" value="Sign In" />
    </form>

    <svelte:fragment slot="footer">
        Feeds are exported under randomly-generated URLs. Though they should not
        be guessable, they may end up "leaking" if accidentally sent to someone.
    </svelte:fragment>
</Layout>

<style>
    .sign-in {
        display: flex;
        justify-content: center;
    }

    .sign-in input[type="submit"] {
        margin-left: 0.5em;
    }
</style>
