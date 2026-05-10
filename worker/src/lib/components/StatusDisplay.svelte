<script lang="ts">
    import {BUBBLE_COLOR, BUBBLE_TEXT_COLOR} from "$lib/constants";
    import type {Status} from "$lib/status";
    import AccountLink from "./AccountLink.svelte";
    import StatusDisplayContent from "./StatusDisplayContent.svelte";
    import StatusDisplayFooter from "./StatusDisplayFooter.svelte";

    let {
        status,
        includeStatusJson = false,
    }: {
        status: Status;
        includeStatusJson?: boolean;
    } = $props();
    let repost = $derived(status.repost);
    let contentStatus = $derived(repost?.status ?? status);
</script>

<div
    style="display:table;border-spacing:0;border-collapse:collapse;font-family:sans-serif;font-size:inherit;font-weight:inherit;font-style:inherit;font-variant:inherit;color:${BUBBLE_TEXT_COLOR};width:100%">
    <div style="display:table-row">
        <div
            style="width:48px;padding:0 .5em 0 0 !important;display:table-cell;vertical-align:top">
            {#if repost}
                <a href={repost.status.author.url} rel="external">
                    <img
                        src={repost.status.author.avatarUrl}
                        width="36"
                        height="36"
                        style="border-radius:4px;overflow:hidden;max-width:none"
                        alt=""
                        class="nnw-nozoom" />
                    <img
                        src={repost.by.avatarUrl}
                        width="24"
                        height="24"
                        style="border-radius:4px;overflow:hidden;max-width:none;transform:translate(18px,-18px);box-shadow:1px 1px 6px rgba(0, 0, 0, 0.3);"
                        alt=""
                        class="nnw-nozoom" />
                </a>
            {:else}
                <a href={status.author.url} rel="external">
                    <img
                        src={status.author.avatarUrl}
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
                {#if repost}
                    <font size="-1" style="opacity:0.5">
                        <AccountLink account={repost.by} />↺ {repost.label}<br />
                    </font>
                    <AccountLink account={repost.status.author} />
                {:else}
                    <AccountLink account={status.author} />
                {/if}
            </div>
            <div
                style="background:{BUBBLE_COLOR};border-radius:6px;margin-top:.5em;padding:.5em">
                {#if contentStatus.spoilerText}
                    <details>
                        <summary style="cursor:pointer"
                            >{contentStatus.spoilerText}</summary>
                        <StatusDisplayContent status={contentStatus} />
                    </details>
                {:else}
                    <StatusDisplayContent status={contentStatus} />
                {/if}
                <StatusDisplayFooter {status} />
            </div>
        </div>
    </div>
</div>
{#if includeStatusJson}
    <pre>{JSON.stringify(status.debugJson ?? status, null, 2)}</pre>
{/if}
