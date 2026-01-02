<script lang="ts">
    import "lite-youtube-embed/src/lite-yt-embed.css";
    import {onMount} from "svelte";

    let {data} = $props();

    onMount(() => {
        import("lite-youtube-embed/src/lite-yt-embed.js");
    });
</script>

<svelte:head>
    <title>YouTube Video</title>
</svelte:head>

<lite-youtube videoid={data.videoId} playlabel="Play Video"></lite-youtube>

<style>
    :global(html),
    :global(body) {
        margin: 0;
        padding: 0;
        height: 100%;
        background: white;
    }
    @media (prefers-color-scheme: dark) {
        :global(html),
        :global(body) {
            background: black;
        }
    }
    :global(body) {
        display: flex;
        align-items: center;
        justify-content: center;
    }
    :global(lite-youtube) {
        width: 100%;
        max-width: 100%;
    }
</style>
