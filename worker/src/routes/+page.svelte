<script lang="ts">
    import {APP_NAME} from "$lib/constants";
    import Layout from "$lib/components/Layout.svelte";
    import {onMount} from "svelte";
    let emailNode: HTMLAnchorElement | undefined;

    onMount(() => {
        if (!emailNode) {
            return;
        }
        var email = [
            109, 105, 104, 97, 105, 64, 112, 101, 114, 115, 105, 115, 116, 101,
            110, 116, 46, 105, 110, 102, 111,
        ]
            .map(i => String.fromCharCode(i))
            .join("");
        emailNode.href = `mailto:${email}`;
        emailNode.textContent = email;
    });
</script>

<Layout>
    <p slot="intro">
        {APP_NAME} is a collection of tools that let you keep up with the "real-time
        web" better (think
        <a
            href="http://en.wikipedia.org/wiki/Transmission_Control_Protocol#Flow_control"
            >flow control</a
        >). Instead of living in fear of missing something, these tools let you
        consume information at your desired pace in efficient batches.
    </p>

    <div class="tools">
        <a href="/masto-feeder/" class="tool even">
            <h2>Masto Feeder</h2>
            <p>Keep up with Mastodon posts in your favorite feed reader</p>
        </a>
    </div>

    <svelte:fragment slot="footer">
        <p>Retired tools:</p>

        <ul>
            <li>
                <b>Feed Playback</b>: Allowed you to start reading a blog (or
                any other feed) from the very beginning. Used the Google Reader
                feed cache to provide archived feed data, and thus stopped
                working in 2013 when
                <a
                    href="http://googlereader.blogspot.com/2013/07/a-final-farewell.html"
                    >Google Reader was shut down</a
                >.
            </li>
            <li>
                <b>Tweet Digest</b>: Allowed you to read Twitter updates in
                batches via a feed reader. Stopped working in 2023 when Twitter
                <a
                    href="https://twitter.com/TwitterDev/status/1621026986784337922"
                    >shut down all free API access</a
                >.
            </li>
            <li>
                <b>Bird Feeder</b>: Allowed you to read your Twitter timeline in
                a feed reader. Stopped working in 2023 when Twitter
                <a
                    href="https://twitter.com/TwitterDev/status/1621026986784337922"
                    >shut down all free API access</a
                >.
            </li>
        </ul>

        <p>
            {APP_NAME} was created by
            <a href="https://persistent.info">Mihai Parparita</a>, who can be
            reached at <a href="mailto:" bind:this={emailNode}>email</a>.
            <a href="https://github.com/mihaip/streamspigot"
                >Source is available</a
            >.
        </p>
    </svelte:fragment>
</Layout>

<style>
    .tools {
        overflow: hidden;
        width: 480px;
        margin: 0 auto;
    }

    .tool {
        clear: both;
        display: block;
        text-decoration: none;
        width: 360px;
        border-radius: 10px;
        padding: 10px;
        margin: 10px;
        background: #f6f6f6;
        text-align: center;
        position: relative;
    }

    @media (max-width: 500px) {
        .tools {
            width: 320px;
        }

        .tool {
            width: 240px;
        }
    }

    .tool:before {
        display: block;
        width: 10px;
        height: 20px;
        background: #f6f6f6;
        content: " ";
        position: absolute;
        top: -20px;
    }

    .tool:first-child:before {
        display: none;
    }

    .tool.even {
        float: left;
    }

    .tool.even:before {
        right: 60px;
    }

    /*
    TODO: uncomment when adding more tools
     .tool.odd {
        float: right;
    }

    .tool.odd:before {
        left: 40px;
    }
    */

    .tool:hover {
        background: #fff;
    }

    .tool h2 {
        font-size: 18px;
        font-weight: bold;
        text-decoration: underline;
        color: #2db300;
        margin: 0 0 0.25em 0;
    }

    .tool p {
        margin: 0;
        color: #000;
    }
</style>
