<script lang="ts">
    import {APP_NAME} from "$lib/constants";
    import type {Snippet} from "svelte";

    let {
        title,
        subtitle,
        intro,
        children,
        footer,
    }: {
        title?: string;
        subtitle?: string;
        intro?: Snippet;
        children?: Snippet;
        footer?: Snippet;
    } = $props();
</script>

<svelte:head>
    <title>{title ? `${title} - ${APP_NAME}` : APP_NAME}</title>
</svelte:head>

<div class="header">
    <a href="/" class="app-title"><h1>{APP_NAME}</h1></a>
    {#if title}
        <div class="page-title">
            {title}
            {#if subtitle}
                <div class="page-subtitle">{subtitle}</div>
            {/if}
        </div>
    {/if}
</div>

<div class="container">
    <div class="intro block">
        {@render intro?.()}
    </div>

    {@render children?.()}

    <div class="footer block">
        {@render footer?.()}
    </div>
</div>

<style>
    /* TODO: switch to nested styles once we upgrade to Svelte 5 */
    :global(div, table, form) {
        margin: 0;
    }

    :global(html, body) {
        margin: 0;
        padding: 0;
    }

    :global(body) {
        background: #cddcff;
        font-family: Helvetica, Arial, sans-serif;
        font-size: 10pt;
    }

    :global(a) {
        color: #2db300;
        text-decoration: underline;
        cursor: pointer;
    }

    .block {
        padding: 2em;
    }

    .block :global(p) {
        line-height: 1.5em;
        margin: 1em 0;
    }

    .block :global(p:first-child) {
        margin-top: 0;
    }

    .block :global(p:last-child) {
        margin-bottom: 0;
    }

    .header {
        min-height: 194px;
        background: url($lib/assets/header-background.png) repeat-x;
        position: relative;
    }

    .app-title {
        display: block;
        width: 100%;
        height: 194px;
        background: url($lib/assets/header.png) no-repeat center top;
    }

    .app-title h1 {
        display: none;
    }

    .page-title {
        position: absolute;
        right: 50%;
        margin-right: -75px;
        top: 136px;
        text-align: right;
        font-size: 32px;
        font-weight: bold;
        color: #32bc00;
    }

    .page-subtitle {
        font-size: 14px;
        font-weight: normal;
    }

    .container {
        max-width: 625px;
        margin: 2em auto 0;
    }

    .intro {
        margin-bottom: 2em;
        background: #f6f6f6;
    }

    .footer {
        margin-top: 2em;
        background: #dde8ff;
    }

    @media (max-width: 500px) {
        .header {
            background-size: 32px 97px;
            min-height: 97px;
        }

        .app-title {
            background-size: 490px 97px;
            height: 97px;
        }

        .page-title {
            top: 68px;
            margin-right: -35px;
            font-size: 20px;
        }

        .container {
            margin-top: 1em;
        }
    }
</style>
