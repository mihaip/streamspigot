<script lang="ts">
    import type {DisplayStatus} from "$lib/masto-feeder/display-status";

    export let displayStatus: DisplayStatus;
    const {status, cardIframe} = displayStatus;
    let html = status.content;

    // Replace <p>'s with newlines so that we can avoid leading/trailing margins.
    if (html.startsWith("<p>") && html.endsWith("</p>")) {
        html = html.slice(3, -4).replaceAll("</p><p>", "<br><br>");
    }
</script>

{@html html}

{#if status.poll}
    {@const poll = status.poll}
    <table
        border="1"
        cellspacing="0"
        cellpadding="2"
        style="border-collapse:collapse">
        <caption style="background:#00000011">
            Poll
            {#if poll.votesCount > 0}
                ({poll.votesCount} votes)
            {/if}
        </caption>
        {#each poll.options as option}
            {@const percent =
                poll.votesCount > 0 && option.votesCount
                    ? (100.0 * option.votesCount) / poll.votesCount
                    : 0}
            <tr>
                <td>{option.title}</td>
                <td>{percent.toFixed(2)}%</td>
            </tr>
        {/each}
    </table>
{/if}

{#each status.mediaAttachments as attachment}
    {@const attachmentUrl = attachment.remoteUrl ?? attachment.url}
    {@const description = attachment.description ?? attachment.type}
    <p>
        {#if attachment.type === "image"}
            <a href={attachmentUrl}
                ><img
                    src={attachment.remoteUrl ?? attachment.previewUrl}
                    alt={description}
                    class="nnw-nozoom"
                    style="border: 0" /></a>
        {:else if attachment.type === "video"}
            <!-- svelte-ignore a11y-media-has-caption -->
            <video
                src={attachmentUrl}
                poster={attachment.previewRemoteUrl}
                autoplay
                loop />
        {:else if attachment.type === "gifv"}
            <!-- svelte-ignore a11y-media-has-caption -->
            <video
                src={attachmentUrl}
                poster={attachment.previewRemoteUrl}
                autoplay
                loop />
        {:else}
            <a href={attachmentUrl}>{description}</a>
        {/if}
    </p>
{/each}

{#if cardIframe}
    <div style="margin-top:1em">
        <iframe
            src={cardIframe.url}
            title={cardIframe.title}
            width={cardIframe.width}
            height={cardIframe.height}
            frameborder="0" />
    </div>
{:else if status.card && status.card.title}
    <!-- Can't use flexbox or real tables due to NetNewsWire style stripping. -->
    <div style="margin-top:1em;border-radius:4px;border:solid 1px #ccc;">
        <div style="display:table;width:100%">
            <div style="display:table-row">
                {#if status.card.image}
                    <div
                        style="display:table-cell;vertical-align:top;width:128px;padding:2px;">
                        <a href={status.card.url}
                            ><img
                                src={status.card.image}
                                alt={status.card.title}
                                class="nnw-nozoom"
                                width="128"
                                style="border:0;border-radius:4px;overflow:hidden;max-width:none" /></a>
                    </div>
                {/if}
                <div style="display:table-cell;vertical-align:top;padding:2px;">
                    <a href={status.card.url}><b>{status.card.title}</b></a
                    ><br />{status.card.description}
                </div>
            </div>
        </div>
    </div>
{/if}
