<script lang="ts">
    import type {Snippet} from "svelte";

    let {
        href,
        target = undefined,
        rel = "external",
        children,
    }: {
        href: string;
        target?: string;
        rel?: string;
        children: Snippet;
    } = $props();
</script>

<a {href} {target} {rel}>{@render children()}</a>

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
</style>
