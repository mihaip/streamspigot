import { $, fetchJson, htmlEscape, throttle } from "./util.js";

export function init () {
  initList();
  initUsernames();

  updateLinks();
};

function isValidUsername (username) {
  return TWITTER_USERNAME_RE.test(username);
};

function initList () {
  var listOwnerNode = $("#twitter-list-owner");
  listOwnerNode.onkeyup = throttle(
    fetchTwitterLists,
    500
  );

  var listsNode = $("#twitter-lists");
  listsNode.onchange = updateLinks;
};

function fetchTwitterLists () {
  var listOwnerNode = $("#twitter-list-owner");
  var listsNode = $("#twitter-lists");
  for (var i = listsNode.options.length - 1; i >= 1; i--) {
    listsNode.removeChild(listsNode.options[i]);
  }
  listsNode.disabled = true;
  var listOwner = listOwnerNode.value;

  if (!listOwner) {
    updateLinks();
    return;
  }

  listOwner = listOwner.trim();
  if (!isValidUsername(listOwner)) {
    updateLinks();
    return;
  }

  listsNode.options[0].innerHTML = "Loading...";

  fetchJson(
    "/tweet-digest/lists?username=" + encodeURIComponent(listOwner),
    function (lists) {
      listsNode.options[0].innerHTML = "Lists";
      for (var i = 0; i < lists.length; i++) {
        var listOptionNode = document.createElement("option");
        listOptionNode.value = lists[i];
        listOptionNode.appendChild(document.createTextNode(lists[i]));
        listsNode.appendChild(listOptionNode);
      }
      if (lists.length) {
        listsNode.disabled = false;
      }
    },
    function () {
      listsNode.options[0].innerHTML = "Error";
    }
  );
};

function initUsernames () {
  var usernamesNode = $("#usernames");
  var templateRowNode = usernamesNode.getElementsByTagName("div")[0];
  initUsernameRow(templateRowNode);
};

function initUsernameRow (rowNode) {
  var inputNode = rowNode.getElementsByTagName("input")[0];
  inputNode.value = "";
  inputNode.addEventListener("keyup", function (event) {
    if (event.key === "Enter") {
      addUsernameRow(rowNode);
    } else {
      updateLinks();
    }
  });

  var buttonNodes = rowNode.getElementsByTagName("button");

  buttonNodes[0].disabled = buttonNodes[1].disabled = false;

  buttonNodes[0].onclick = function () {
    removeUsernameRow(rowNode);
  };
  buttonNodes[1].onclick = function () {
    addUsernameRow(rowNode);
  };

  // Prevent focusing of buttons (to remove dotted border outline, which
  // can't seem to be removed with just CSS)
  buttonNodes[0].onfocus = function () {
    buttonNodes[0].blur();
  };

  buttonNodes[1].onfocus = function () {
    buttonNodes[1].blur();
  };
};

function removeUsernameRow (currentRow) {
  currentRow.parentNode.removeChild(currentRow);

  updateLinks();
};

function addUsernameRow (currentRow) {
  var currentRowCount =
    currentRow.parentNode.getElementsByTagName("input").length;
  if (currentRowCount == 10) {
    alert("At most 10 usernames can be added to a digest.");
    return;
  }
  var newRow = currentRow.cloneNode(true);
  initUsernameRow(newRow);

  currentRow.parentNode.insertBefore(newRow, currentRow.nextSibling);

  newRow.getElementsByTagName("input")[0].focus();

  updateLinks();
};

function updateLinks () {
  var errorUsernames = [];

  // See if a list was selected
  var listOwnerNode = $("#twitter-list-owner");
  var listOwner = listOwnerNode.value.trim();
  var listId = null;
  if (listOwner) {
    var listsNode = $("#twitter-lists");
    if (listsNode.selectedIndex > 0) {
      listId = listsNode.options[listsNode.selectedIndex].value;
    }
    if (!isValidUsername(listOwner)) {
      errorUsernames.push(listOwner);
    }
  }

  // Collect all usernames
  var usernamesNode = $("#usernames");
  var usernameNodes = usernamesNode.getElementsByTagName("input");
  var usernames = [];

  for (var i = 0, usernameNode; (usernameNode = usernameNodes[i]); i++) {
    var username = usernameNode.value.trim();

    if (username) {
      usernames.push(username);
      if (!isValidUsername(username)) {
        errorUsernames.push(username);
      }
    }
  }

  // Update links
  var linksNode = $("#digest-links");
  var emptyNode = $("#digest-empty");
  var errorNode = $("#digest-error");
  if (errorUsernames.length) {
    emptyNode.className = "hidden";
    linksNode.className = "hidden";
    errorNode.className = "";

    $("#digest-error-message").innerHTML =
      '"' +
      htmlEscape(errorUsernames.join('", "')) +
      '" ' +
      (errorUsernames.length == 1 ? "is an" : "are") +
      " invalid Twitter username" +
      (errorUsernames.length == 1 ? "" : "s") +
      ".";
  } else if ((listOwner && listId) || usernames.length) {
    emptyNode.className = "hidden";
    linksNode.className = "";
    errorNode.className = "hidden";

    var baseUrl = "digest?";

    if (listOwner && listId) {
      baseUrl += "list=" + listOwner + "/" + listId;
    } else {
      baseUrl += "usernames=" + usernames.join("+");
    }

    var htmlLinkNode = $("#digest-html-link");
    var feedLinkNode = $("#digest-feed-link");
    htmlLinkNode.href = baseUrl + "&output=html";
    feedLinkNode.href = baseUrl + "&output=atom";
  } else {
    emptyNode.className = "";
    linksNode.className = "hidden";
    errorNode.className = "hidden";
  }

  // Update button state (so if there's only one username, it can't be
  // removed)
  var buttons = usernamesNode.getElementsByTagName("button");
  buttons[0].disabled = usernameNodes.length == 1;
};

const TWITTER_USERNAME_RE = /^[a-zA-Z0-9_]{1,15}$/;
