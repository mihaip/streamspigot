import { $ } from "./util.js";

export function init() {
  $("#mastofeeder-reset-feed-id").addEventListener("click", resetFeedId);
}

function resetFeedId() {
  var feedContainerNode = $("#mastofeeder-feed-container");
  feedContainerNode.classList.add("disabled");

  fetch("/masto-feeder/reset-feed-id", { method: "POST" })
    .then((response) => response.text())
    .then(() => window.location.reload())
    .catch((error) => {
      feedContainerNode.classList.remove("disabled");
      alert("Could not reset the feed URL: " + error);
    });
}
