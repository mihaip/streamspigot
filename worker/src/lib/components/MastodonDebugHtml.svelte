<script lang="ts">
    import type {DisplayStatus} from "$lib/masto-feeder/display-status";
    import MastodonStatus from "./MastodonStatus.svelte";

    let {
        displayStatuses,
        includeStatusJson = false,
    }: {
        displayStatuses: DisplayStatus[];
        includeStatusJson?: boolean;
    } = $props();
</script>

{#each displayStatuses as displayStatus}
    <div style="margin: 1em 0">
        <h1>{displayStatus.titleAsText}</h1>
        <MastodonStatus {displayStatus} {includeStatusJson} />
    </div>
{/each}
