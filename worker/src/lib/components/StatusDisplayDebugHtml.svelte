<script lang="ts">
    import type {Status} from "$lib/status";
    import StatusDisplay from "./StatusDisplay.svelte";

    let {
        statuses,
        includeStatusJson = false,
    }: {
        statuses: Status[];
        includeStatusJson?: boolean;
    } = $props();
</script>

{#each statuses as status (status.id)}
    <div style="margin: 1em 0">
        <h1>{status.titleText}</h1>
        <StatusDisplay {status} {includeStatusJson} />
    </div>
{/each}
