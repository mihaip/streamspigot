<script lang="ts">
    import {USER_LINK_COLOR} from "$lib/constants";
    import {displayName} from "$lib/masto-feeder/display-status";
    import type {mastodon} from "masto";

    let {
        account,
    }: {
        account: mastodon.v1.Account;
    } = $props();
</script>

<b>{displayName(account)}</b>
<a href={account.url} style="text-decoration:none">
    <font color={USER_LINK_COLOR}>@{account.username}</font>
</a>
