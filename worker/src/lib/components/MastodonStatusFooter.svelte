<script lang="ts">
    import {ANCHOR_COLOR} from "$lib/constants";
    import type {DisplayStatus} from "$lib/masto-feeder/display-status";

    export let displayStatus: DisplayStatus;
    const {permalinkStatus} = displayStatus;
</script>

<div style="text-align:right;margin:0.2em 0 0 0">
    <font size="-2">
        <a href={displayStatus.permalink} style="color:{ANCHOR_COLOR}">
            {displayStatus.createdAtFormatted}</a>
        {#if permalinkStatus.application}
            from {permalinkStatus.application.name}
        {/if}
        {#if permalinkStatus.inReplyToId}
            {" "}(<a
                href="TODO/{permalinkStatus.id}"
                style="color:{ANCHOR_COLOR}">in reply to</a
            >)
        {/if}
    </font>
</div>
