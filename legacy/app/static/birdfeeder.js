import { $ } from "./util.js";

export function init() {
  $("#birdfeeder-reset-feed-id").addEventListener("click", resetFeedId);
}

function resetFeedId() {
  var feedContainerNode = $("#birdfeeder-feed-container");
  feedContainerNode.classList.add("disabled");

  fetch("/bird-feeder/reset-feed-id", { method: "POST" })
    .then((response) => response.text())
    .then(() => window.location.reload())
    .catch((error) => {
      feedContainerNode.classList.remove("disabled");
      alert("Could not reset the feed URL: " + error);
    });
}
