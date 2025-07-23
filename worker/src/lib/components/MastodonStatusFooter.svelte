<script lang="ts">
    import {ANCHOR_COLOR} from "$lib/constants";
    import type {DisplayStatus} from "$lib/masto-feeder/display-status";

    let {
        displayStatus,
    }: {
        displayStatus: DisplayStatus;
    } = $props();
    const {permalinkStatus, permalinkDisplayStatus} = displayStatus;
</script>

<div style="text-align:right;margin:0.2em 0 0 0">
    <font size="-2">
        <a
            href={displayStatus.permalink}
            style="color:{ANCHOR_COLOR};text-decoration:none">
            {displayStatus.createdAtFormatted}</a>
        {#if permalinkStatus.application}
            {" "}from {permalinkStatus.application.name}
        {/if}
        {#if permalinkStatus.inReplyToId}
            {" "}(<a
                href={permalinkDisplayStatus.parentUrl}
                style="color:{ANCHOR_COLOR};text-decoration:none">in reply to</a
            >)
        {/if}
    </font>
</div>
