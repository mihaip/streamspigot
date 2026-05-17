<script lang="ts">
    import type {Snippet} from "svelte";

    let {
        href,
        feedType = "atom",
        target = undefined,
        rel = "external",
        children,
    }: {
        href: string;
        feedType?: "atom" | "json";
        target?: string;
        rel?: string;
        children: Snippet;
    } = $props();

    let isJsonFeed = $derived(feedType === "json");
</script>

<a {href} {target} {rel} class:json-feed={isJsonFeed}>{@render children()}</a>

<style>
    a {
        padding-left: 19px;
        background-position: center left;
        background-repeat: no-repeat;
        background-image: url($lib/assets/feed-icon.png);
        background-image: image-set(
            url($lib/assets/feed-icon.png) 1x,
            url($lib/assets/feed-icon@2x.png) 2x
        );
    }

    a.json-feed {
        background-size: 16px 16px;
        background-image: url($lib/assets/jsonfeed-icon.svg);
    }
</style>
