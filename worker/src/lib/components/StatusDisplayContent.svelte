<script lang="ts">
    import type {Status} from "$lib/status";
    import StatusDisplay from "./StatusDisplay.svelte";

    let {
        status,
    }: {
        status: Status;
    } = $props();
    let contentAsHtml = $derived(status.contentHtml);
    let card = $derived(status.card);
    let cardIframe = $derived(card?.iframe);
</script>

{@html contentAsHtml}

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
        <tbody>
            {#each poll.options as option (option.title)}
                {@const percent =
                    poll.votesCount > 0 && option.votesCount
                        ? (100.0 * option.votesCount) / poll.votesCount
                        : 0}
                <tr>
                    <td>{option.title}</td>
                    <td>{percent.toFixed(2)}%</td>
                </tr>
            {/each}
        </tbody>
    </table>
{/if}

{#each status.attachments as attachment (attachment.id)}
    <p>
        {#if attachment.type === "image"}
            <a href={attachment.url} rel="external"
                ><img
                    src={attachment.previewUrl ?? attachment.url}
                    alt={attachment.description}
                    class="nnw-nozoom"
                    style="border: 0" /></a>
        {:else if attachment.type === "video"}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
                src={attachment.url}
                poster={attachment.posterUrl}
                autoplay
                loop></video>
        {:else if attachment.type === "gifv"}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
                src={attachment.url}
                poster={attachment.posterUrl}
                autoplay
                loop></video>
        {:else}
            <a href={attachment.url} rel="external" style="text-decoration:none"
                >{attachment.description}</a>
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
            frameborder="0"></iframe>
    </div>
{:else if card}
    <!-- Can't use flexbox or real tables due to NetNewsWire style stripping. -->
    <div style="margin-top:1em;border-radius:4px;border:solid 1px #ccc;">
        <div style="display:table;width:100%">
            <div style="display:table-row">
                {#if card.imageUrl}
                    <div
                        style="display:table-cell;vertical-align:top;width:128px;padding:2px;">
                        <a href={card.url} rel="external"
                            ><img
                                src={card.imageUrl}
                                alt={card.title}
                                class="nnw-nozoom"
                                width="128"
                                style="border:0;border-radius:4px;overflow:hidden;max-width:none" /></a>
                    </div>
                {/if}
                <div style="display:table-cell;vertical-align:top;padding:2px;">
                    <a
                        href={card.url}
                        rel="external"
                        style="text-decoration:none"
                        ><b>{card.title}</b></a
                    ><br />{card.description}
                </div>
            </div>
        </div>
    </div>
{/if}

{#if status.quote}
    <div
        style="margin-top:1em;border-radius:4px;border:solid 1px #ccc;padding:8px;">
        <StatusDisplay status={status.quote} />
    </div>
{/if}
