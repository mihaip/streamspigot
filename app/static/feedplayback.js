import { $, fetchJson, getIso8601DateString, htmlEscape, throttle } from "./util.js";

export function init () {
  $("#feedplayback-url").addEventListener(
    "keyup",
    throttle(fetchFeedInfo, 1000)
  );

  $("#feedplayback-setup-form").addEventListener(
    "submit",
    setup
  );

  $("#feedplayback-error-details-link").addEventListener("click", () =>
    $("#feedplayback-error-details").classList.remove("hidden")
  );

  $("#feedplayback-start-date").addEventListener(
    "input",
    throttle(updatePreview, 500)
  );

  for (const sampleLinkNode of document.querySelectorAll("a.sample-feed")) {
    sampleLinkNode.addEventListener(
      "click",
      event => {
        event.preventDefault();
        event.stopPropagation();
        preFillForm(sampleLinkNode.href);
      })
  }

  const parameters = new URLSearchParams(window.location.search);
  const url = parameters.get("url");
  if (url) {
    preFillForm(url);
  }
};

function preFillForm (url) {
  $("#feedplayback-url").value = url;
  fetchFeedInfo();
};

function setEnabledState (isEnabled) {
  var tableNode = $("#feedplayback-setup-table");
  tableNode.classList.toggle("enabled", isEnabled);
  tableNode.classList.toggle("disabled", !isEnabled);

  $("#feedplayback-start-date").disabled = !isEnabled;
  $("#feedplayback-frequency").disabled = !isEnabled;
  $("#feedplayback-setup").disabled = !isEnabled;
};

function fetchFeedInfo () {
  $("#feedplayback-result").classList.add("hidden");
  $("#feedplayback-error").classList.add("hidden");

  var urlNode = $("#feedplayback-url");
  var url = urlNode.value.trim();

  if (url == previousFeedInfoUrl) {
    return;
  }
  previousFeedInfoUrl = url;

  var statusNode = $("#feedplayback-status");
  setEnabledState(false);
  statusNode.innerHTML = "Looking up URL...";

  var urlNode = $("#feedplayback-url");
  var url = urlNode.value;
  fetchJson(
    "/feed-playback/feed-info?url=" + encodeURIComponent(url),
    function (info) {
      var statusHtml = "";
      var isEnabled = false;

      if (info.feedUrl) {
        statusHtml += "Feed URL: <b>" + htmlEscape(info.feedUrl) + "</b>";
        $("#feedplayback-feed-url").value = info.feedUrl;
        if (info.feedTitle) {
          statusHtml += "<br>Title: <b>" + htmlEscape(info.feedTitle) + "</b>";
        }
        if (info.itemCount) {
          var oldestItemDate = new Date(info.oldestItemTimestampMsec);
          var oldestItemDateDisplay = oldestItemDate.toLocaleDateString();
          statusHtml += "<br><b>" + info.itemCount + " items</b> ";
          statusHtml += "(oldest is from <b>" + oldestItemDateDisplay + "</b>)";

          var oldestItemDateValue = getIso8601DateString(oldestItemDate);
          $("#feedplayback-start-date").value = oldestItemDateValue;

          isEnabled = true;
          updatePreview();
        } else {
          statusHtml += "<br>No feed items found.";
        }
      } else {
        statusHtml += "No feed found.";
      }

      statusNode.innerHTML = statusHtml;
      setEnabledState(isEnabled);
    },
    function () {
      statusNode.innerHTML = "Error: could not look up URL.";
    }
  );
};

function updatePreview () {
  var feedUrl = $("#feedplayback-feed-url").value;
  var startDate = $("#feedplayback-start-date").value;

  fetchJson(
    "/feed-playback/preview?url=" +
      encodeURIComponent(feedUrl) +
      "&start-date=" +
      encodeURIComponent(startDate),
    function (preview) {
      if (preview && preview.firstItem) {
        $("#feedplayback-first-item").classList.remove("hidden");
        $("#feedplayback-first-item-title").innerHTML =
          preview.firstItem.titleHtml;
        $("#feedplayback-first-item-title").href = preview.firstItem.url;
      } else {
        $("#feedplayback-first-item").classList.add("hidden");
      }
    }
  );
};

function setup (event) {
  event.preventDefault();

  var paramsMap = {
    url: "feedplayback-feed-url",
    "start-date": "feedplayback-start-date",
    frequency: "feedplayback-frequency",
  };

  var data = "";

  for (var paramName in paramsMap) {
    data +=
      paramName +
      "=" +
      encodeURIComponent($("#" + paramsMap[paramName]).value) +
      "&";
  }

  if (data === previousSetupParams) {
    return;
  }

  previousSetupParams = data;

  $("#feedplayback-setup").disabled = true;

  fetchJson(
    "/feed-playback/create",
    function (data) {
      $("#feedplayback-setup").disabled = false;
      $("#feedplayback-result").classList.remove("hidden");
      $("#feedplayback-error").classList.add("hidden");

      var feedUrlNode = $("#feedplayback-subscription-feed-url");
      feedUrlNode.href = data.feedUrl;
      var readerUrlNode = $("#feedplayback-subscription-reader-url");
      readerUrlNode.href = data.readerUrl;
    },
    function (statusCode, responseText) {
      previousSetupParams = undefined;
      $("#feedplayback-setup").disabled = false;
      $("#feedplayback-result").classList.add("hidden");
      $("#feedplayback-error").classList.remove("hidden");

      $("#feedplayback-error-details-status").innerHTML =
        htmlEscape(statusCode);
      $("#feedplayback-error-details-response").innerHTML =
        htmlEscape(responseText);
    },
    data
  );
};

let previousFeedInfoUrl = undefined;
let previousSetupParams = undefined;
