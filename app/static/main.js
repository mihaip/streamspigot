// TODO(mihaip): Start using Plovr

goog.require('goog.dom');
goog.require('goog.net.EventType');
goog.require('goog.net.XhrIo');
goog.require('goog.string');

goog.provide('streamspigot.tweetdigest');
goog.provide('streamspigot.feedplayback');
goog.provide('streamspigot.util');

streamspigot.tweetdigest.init = function() {
  streamspigot.tweetdigest.initList();
  streamspigot.tweetdigest.initUsernames();
  
  streamspigot.tweetdigest.updateLinks();
};

streamspigot.tweetdigest.initList = function() {
  var listOwnerNode = goog.dom.$('twitter-list-owner');
  listOwnerNode.onkeyup = streamspigot.util.throttle(
      streamspigot.tweetdigest.fetchTwitterLists, 500);
  
  var listsNode = goog.dom.$('twitter-lists');
  listsNode.onchange = streamspigot.tweetdigest.updateLinks;
};

streamspigot.tweetdigest.fetchTwitterLists = function() {
  var listOwnerNode = goog.dom.$('twitter-list-owner');
  var listsNode = goog.dom.$('twitter-lists');
  for (var i = listsNode.options.length - 1; i >= 1; i--) {
    listsNode.removeChild(listsNode.options[i]);
  }
  listsNode.disabled = true;
  var listOwner = listOwnerNode.value;
  
  if (!listOwner) {
    streamspigot.tweetdigest.updateLinks();
    return;
  };
  listsNode.options[0].innerHTML = 'Loading...';
  
  streamspigot.util.fetchJson(
      '/tweet-digest/lists?username=' + encodeURIComponent(listOwner),
      function (lists) {
        listsNode.options[0].innerHTML = 'Lists';      
        for (var i = 0; i < lists.length; i++) {
          var listOptionNode = document.createElement('option');
          listOptionNode.value = lists[i];
          listOptionNode.appendChild(document.createTextNode(lists[i]));
          listsNode.appendChild(listOptionNode);
        }
        if (lists.length) {
          listsNode.disabled = false;
        }
      },
      function() {
        listsNode.options[0].innerHTML = 'Error';              
      });
};

streamspigot.tweetdigest.initUsernames = function() {
  var usernamesNode = goog.dom.$('usernames');
  var templateRowNode = usernamesNode.getElementsByTagName('div')[0];
  streamspigot.tweetdigest.initUsernameRow(templateRowNode);
};

streamspigot.tweetdigest.initUsernameRow = function(rowNode) {
  var inputNode = rowNode.getElementsByTagName('input')[0];
  inputNode.value = '';
  inputNode.onkeyup = function(ev) {
    var e = ev || window.event;
    
    // Enter should add a new row
    if (e.keyCode == 13) {
      var inputNode = ev.target || ev.srcElement;
      if (inputNode) {
        var rowNode = inputNode.parentNode.parentNode;
        streamspigot.tweetdigest.addUsernameRow(rowNode);
        return;
      }
    }  
    
    streamspigot.tweetdigest.updateLinks();
  };
  
  var buttonNodes = rowNode.getElementsByTagName('button');
  
  buttonNodes[0].disabled = buttonNodes[1].disabled = false;
  
  buttonNodes[0].onclick = function() {
    streamspigot.tweetdigest.removeUsernameRow(rowNode);
  };
  buttonNodes[1].onclick = function() {
    streamspigot.tweetdigest.addUsernameRow(rowNode);
  };
  
  // Prevent focusing of buttons (to remove dotted border outline, which
  // can't seem to be removed with just CSS)
  buttonNodes[0].onfocus = function() {
    buttonNodes[0].blur();
  }
  
  buttonNodes[1].onfocus = function() {
    buttonNodes[1].blur();
  };
};

streamspigot.tweetdigest.removeUsernameRow = function(currentRow) {
  currentRow.parentNode.removeChild(currentRow);
  
  streamspigot.tweetdigest.updateLinks();
};

streamspigot.tweetdigest.addUsernameRow = function(currentRow) {
  var newRow = currentRow.cloneNode(true);
  streamspigot.tweetdigest.initUsernameRow(newRow);
  
  currentRow.parentNode.insertBefore(newRow, currentRow.nextSibling);
  
  newRow.getElementsByTagName('input')[0].focus();
  
  streamspigot.tweetdigest.updateLinks();
};

streamspigot.tweetdigest.updateLinks = function() {
  // See if a list was selected
  var listOwnerNode = goog.dom.$('twitter-list-owner');
  var listOwner = listOwnerNode.value;
  var listId = null;
  if (listOwner) {
    var listsNode = goog.dom.$('twitter-lists');
    if (listsNode.selectedIndex > 0) {
      listId = listsNode.options[listsNode.selectedIndex].value;
    }
  }
  
  // Collect all usernames
  var usernamesNode = goog.dom.$('usernames');
  var usernameNodes = usernamesNode.getElementsByTagName('input');
  var usernames = [];
  
  for (var i = 0, usernameNode; usernameNode = usernameNodes[i]; i++) {
    var username = usernameNode.value;
    username = username.replace(/^\s*/, '');
    username = username.replace(/\s*$/, '');
    
    if (username) {
      usernames.push(username);
    }
  }
  
  // Update links
  var linksNode = goog.dom.$('digest-links');
  var emptyNode = goog.dom.$('digest-empty');
  if ((listOwner && listId) || usernames.length) {
    emptyNode.className = 'hidden';
    linksNode.className = '';
    
    var baseUrl = 'digest?';
    
    if (listOwner && listId) {
      baseUrl += 'list=' + listOwner + '/' + listId;
    } else {
      baseUrl += 'usernames=' + usernames.join('+');
    }

    var htmlLinkNode = goog.dom.$('digest-html-link');
    var feedLinkNode = goog.dom.$('digest-feed-link');
    htmlLinkNode.href = baseUrl + '&output=html';
    feedLinkNode.href = baseUrl + '&output=atom';
  } else {
    emptyNode.className = '';
    linksNode.className = 'hidden';
  }
  
  // Update button state (so if there's only one username, it can't be
  // removed)
  var buttons = usernamesNode.getElementsByTagName('button');
  buttons[0].disabled = usernameNodes.length == 1;
};

streamspigot.feedplayback.init = function() {
  var urlNode = goog.dom.$('feedplayback-url');
  urlNode.onkeyup = streamspigot.util.throttle(
      streamspigot.feedplayback.fetchFeedInfo, 1000);
};

streamspigot.feedplayback.preFillForm = function(url) {
  goog.dom.$('feedplayback-url').value = url;
  streamspigot.feedplayback.fetchFeedInfo();
};

streamspigot.feedplayback.fetchFeedInfo = function() {
  var urlNode = goog.dom.$('feedplayback-url');
  var url = urlNode.value;
  
  var statusNode = goog.dom.$('feedplayback-status');
  statusNode.innerHTML = 'Looking up URL...';

  var urlNode = goog.dom.$('feedplayback-url');
  var url = urlNode.value;
  streamspigot.util.fetchJson(
      '/feed-playback/feed-info?url=' + encodeURIComponent(url),
      function (info) {
        var setupNode = goog.dom.$('feedplayback-setup-table');
        
        if (info.feedUrl) {
          statusNode.innerHTML =
              'Feed URL: ' + goog.string.htmlEscape(info.feedUrl);
          setupNode.className = 'enabled';
        } else {
          statusNode.innerHTML = 'No feed found.';
          setupNode.className = 'disabled';
        }
      },
      function() {
        statusNode.innerHTML = 'Error: could not look up URL.';
      });
};

streamspigot.util.fetchJson = function(url, jsonCallback, errorCallback) {
  var xhr = new goog.net.XhrIo();
  
  goog.events.listen(xhr, goog.net.EventType.COMPLETE, function() {
    if (xhr.isSuccess()) {
      jsonCallback(xhr.getResponseJson());
    } else {
      errorCallback();
    }
    xhr.dispose();
  });
  
  xhr.send(url);
};

streamspigot.util.printEmail = function(opt_anchorText) {
  var a = [109, 105, 104, 97, 105, 64, 112, 101, 114, 115, 105, 115, 116,
      101, 110, 116, 46, 105, 110, 102, 111];
  var b = [];
  for (var i = 0; i < a.length; i++) {
    b.push(String.fromCharCode(a[i]));
  }
  b = b.join('');
  document.write('<' + 'a href="mailto:' + b + '">' + 
                 (opt_anchorText || b) + 
                 '<' + '/a>');
};

streamspigot.util.throttle = function(func, minTimeMs) {
  var timeout = null;
  return function() {
      if (timeout) {
        window.clearTimeout(timeout);
      }
      timeout = window.setTimeout(function() {
          timeout = null;
          func();
      }, minTimeMs);
  };
};
