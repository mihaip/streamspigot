<script lang="ts">
    import {BUBBLE_COLOR, BUBBLE_TEXT_COLOR} from "$lib/constants";
    import type {DisplayStatus} from "$lib/masto-feeder/display-status";
    import AccountLink from "./AccountLink.svelte";
    import MastodonStatusContent from "./MastodonStatusContent.svelte";
    import MastodonStatusFooter from "./MastodonStatusFooter.svelte";

    export let displayStatus: DisplayStatus;
    export let includeStatusJson = false;
    const {status} = displayStatus;
    const contentDisplayStatus =
        displayStatus.reblogDisplayStatus ?? displayStatus;
    const contentStatus = contentDisplayStatus.status;
</script>

<div
    style="display:table;border-spacing:0;border-collapse:collapse;font-family:sans-serif;font-size:inherit;font-weight:inherit;font-style:inherit;font-variant:inherit;color:${BUBBLE_TEXT_COLOR};width:100%">
    <div style="display:table-row">
        <div
            style="width:48px;padding:0 .5em 0 0 !important;display:table-cell;vertical-align:top">
            {#if status.reblog}
                <a href={status.reblog.account.url}>
                    <img
                        src={status.reblog.account.avatar}
                        width="36"
                        height="36"
                        style="border-radius:4px;overflow:hidden;max-width:none"
                        alt=""
                        class="nnw-nozoom" />
                    <img
                        src={status.account.avatar}
                        width="24"
                        height="24"
                        style="border-radius:4px;overflow:hidden;max-width:none;transform:translate(18px,-18px);box-shadow:1px 1px 6px rgba(0, 0, 0, 0.3);"
                        alt=""
                        class="nnw-nozoom" />
                </a>
            {:else}
                <a href={status.account.url}>
                    <img
                        src={status.account.avatar}
                        width="48"
                        height="48"
                        style="border-radius:4px;overflow:hidden;max-width:none"
                        alt=""
                        class="nnw-nozoom" />
                </a>
            {/if}
        </div>
        <div style="display:table-cell;vertical-align:top">
            <div style="padding:0 .5em">
                {#if status.reblog}
                    <font size="-1" style="opacity:0.5">
                        <AccountLink account={status.account} />↺ boosted<br />
                    </font>
                    <AccountLink account={status.reblog.account} />
                {:else}
                    <AccountLink account={status.account} />
                {/if}
            </div>
            <div
                style="background:{BUBBLE_COLOR};border-radius:6px;margin-top:.5em;padding:.5em">
                {#if contentStatus.spoilerText}
                    <details>
                        <summary style="cursor:pointer"
                            >{contentStatus.spoilerText}</summary>
                        <MastodonStatusContent
                            displayStatus={contentDisplayStatus} />
                    </details>
                {:else}
                    <MastodonStatusContent
                        displayStatus={contentDisplayStatus} />
                {/if}
                <MastodonStatusFooter {displayStatus} />
            </div>
        </div>
    </div>
</div>
{#if includeStatusJson}
    <pre>{JSON.stringify(status, null, 2)}</pre>
{/if}
