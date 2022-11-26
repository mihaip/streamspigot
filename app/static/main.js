import { init as birdfeederInit } from "./birdfeeder.js";
import { init as feedplaybackInit } from "./feedplayback.js";
import { init as mastofeederInit } from "./mastofeeder.js";
import { init as tweetdigestInit } from "./tweetdigest.js";
import { exportFunction, $ } from "./util.js";

function init() {
  var a = [
    109, 105, 104, 97, 105, 64, 112, 101, 114, 115, 105, 115, 116, 101, 110,
    116, 46, 105, 110, 102, 111,
  ];
  var b = a.map(i => String.fromCharCode(i)).join("");
  const emailNode = $("#email");
  emailNode.href = "mailto:" + b;
  emailNode.textContent = b;
}

exportFunction("streamspigot.birdfeeder.init", birdfeederInit);
exportFunction("streamspigot.feedplayback.init", feedplaybackInit);
exportFunction("streamspigot.mastofeeder.init", mastofeederInit);
exportFunction("streamspigot.tweetdigest.init", tweetdigestInit);
exportFunction("streamspigot.main.init", init);
