<script lang="ts">
    import {ANCHOR_COLOR} from "$lib/constants";
    import type {Status} from "$lib/status";

    let {
        status,
    }: {
        status: Status;
    } = $props();
</script>

<div style="text-align:right;margin:0.2em 0 0 0">
    <font size="-2">
        <a
            href={status.permalink}
            rel="external"
            style="color:{ANCHOR_COLOR};text-decoration:none">
            {status.createdAtLabel}</a>
        {#if status.applicationName}
            from {status.applicationName}
        {/if}
        {#if status.parentUrl}
            (<a
                href={status.parentUrl}
                rel="external"
                style="color:{ANCHOR_COLOR};text-decoration:none">in reply to</a
            >)
        {/if}
    </font>
</div>
