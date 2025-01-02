<script lang="ts">
    import {USER_LINK_COLOR} from "$lib/constants";
    import {displayName} from "$lib/masto-feeder/display-status";
    import type {mastodon} from "masto";

    export let account: mastodon.v1.Account;
</script>

<b>{displayName(account)}</b>
<a href={account.url} style="text-decoration:none">
    <font color={USER_LINK_COLOR}>@{account.username}</font>
</a>
