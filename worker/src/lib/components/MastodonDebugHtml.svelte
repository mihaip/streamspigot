<script lang="ts">
    import {type mastodon} from "masto";
    import {DisplayStatus} from "$lib/masto-feeder/display-status";
    import MastodonStatus from "./MastodonStatus.svelte";

    export let statuses: mastodon.v1.Status[];
</script>

{#each statuses as status}
    {@const displayStatus = new DisplayStatus(status)}
    <div style="margin: 1em 0">
        <h1>{displayStatus.titleAsText}</h1>
        <MastodonStatus {displayStatus} />
    </div>
{/each}
