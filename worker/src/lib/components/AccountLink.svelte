<script lang="ts">
    import {USER_LINK_COLOR} from "$lib/constants";
    import type {StatusAccount} from "$lib/status";

    let {
        account,
    }: {
        account: StatusAccount;
    } = $props();
</script>

<b>{account.displayName}</b>
<a href={account.url} rel="external" style="text-decoration:none">
    <font color={USER_LINK_COLOR}>@{account.username}</font>
</a>
