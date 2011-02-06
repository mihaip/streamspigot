// TODO(mihaip): Start using Plovr

goog.require('goog.dom');
goog.require('goog.dom.classes');
goog.require('goog.events');
goog.require('goog.events.EventType');
goog.require('goog.events.KeyCodes');
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
  goog.events.listen(
      inputNode,
      goog.events.EventType.KEYUP,
      function(event) {
        if (event.keyCode == goog.events.KeyCodes.ENTER) {
          streamspigot.tweetdigest.addUsernameRow(rowNode);
        } else {
          streamspigot.tweetdigest.updateLinks();
        }
      });
  
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
  goog.events.listen(
      goog.dom.$('feedplayback-url'),
      goog.events.EventType.KEYUP,
      streamspigot.util.throttle(
          streamspigot.feedplayback.fetchFeedInfo, 1000));

  goog.events.listen(
      goog.dom.$('feedplayback-setup-form'),
      goog.events.EventType.SUBMIT,
      streamspigot.feedplayback.setup);
      
  goog.events.listen(
      goog.dom.$('feedplayback-error-details-link'),
      goog.events.EventType.CLICK,
      goog.partial(goog.dom.classes.remove,
          goog.dom.$('feedplayback-error-details'), 'hidden'));
          
  var sampleLinkNodes = goog.dom.$$('a', 'sample-feed');
  for (var i = 0, sampleLinkNode; sampleLinkNode = sampleLinkNodes[i]; i++) {
    goog.events.listen(
        sampleLinkNode,
        goog.events.EventType.CLICK,
        goog.partial(
            streamspigot.feedplayback.preFillForm, sampleLinkNode.href));
  }

  // TODO(mihap): switch to goog.uri.util once we switch to Plovr
  var match = /\?url=([^&]+)&?/.exec(location.search)
  if (match && match[1]) {
    streamspigot.feedplayback.preFillForm(match[1]);
  }
};

streamspigot.feedplayback.preFillForm = function(url, opt_event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  goog.dom.$('feedplayback-url').value = url;
  streamspigot.feedplayback.fetchFeedInfo();
};

streamspigot.feedplayback.setEnabledState = function(isEnabled) {
  var tableNode = goog.dom.$('feedplayback-setup-table');
  goog.dom.classes.enable(tableNode, 'enabled', isEnabled);
  goog.dom.classes.enable(tableNode, 'disabled', !isEnabled);
  
  goog.dom.$('feedplayback-start-date').disabled = !isEnabled;
  goog.dom.$('feedplayback-frequency').disabled = !isEnabled;
  goog.dom.$('feedplayback-setup').disabled = !isEnabled;
};

streamspigot.feedplayback.fetchFeedInfo = function() {
  goog.dom.classes.add(goog.dom.$('feedplayback-result'), 'hidden');
  goog.dom.classes.add(goog.dom.$('feedplayback-error'), 'hidden');

  var urlNode = goog.dom.$('feedplayback-url');
  var url = goog.string.trim(urlNode.value);
  
  if (url == streamspigot.feedplayback.previousFeedInfoUrl) {
    return;
  }
  streamspigot.feedplayback.previousFeedInfoUrl = url;
  
  var statusNode = goog.dom.$('feedplayback-status');
  streamspigot.feedplayback.setEnabledState(false);
  statusNode.innerHTML = 'Looking up URL...';

  var urlNode = goog.dom.$('feedplayback-url');
  var url = urlNode.value;
  streamspigot.util.fetchJson(
      '/feed-playback/feed-info?url=' + encodeURIComponent(url),
      function (info) {
        var statusHtml = '';
        var isEnabled = false;
        
        if (info.feedUrl) {
          statusHtml += 'Feed URL: <b>' +
              goog.string.htmlEscape(info.feedUrl) + '</b>';
          goog.dom.$('feedplayback-feed-url').value = info.feedUrl;
          if (info.feedTitle) {
            statusHtml += '<br>Title: <b>' +
                goog.string.htmlEscape(info.feedTitle) + '</b>';
          }
          if (info.itemCount) {
            var oldestItemDate = new Date(info.oldestItemTimestampMsec);
            var oldestItemDateDisplay = oldestItemDate.toLocaleDateString();
            statusHtml += '<br><b>' + info.itemCount + ' items</b> ';
            statusHtml +=
                '(oldest is from <b>' + oldestItemDateDisplay + '</b>)';

            var oldestItemDateValue =
                streamspigot.util.getIso8601DateString(oldestItemDate);
            goog.dom.$('feedplayback-start-date').value = oldestItemDateValue;
                
            isEnabled = true;
          } else {
            statusHtml += '<br>No feed items found.';
          }
        } else {
          statusHtml += 'No feed found.';
        }
        
        statusNode.innerHTML = statusHtml;
        streamspigot.feedplayback.setEnabledState(isEnabled);
      },
      function() {
        statusNode.innerHTML = 'Error: could not look up URL.';
      });
};

streamspigot.feedplayback.setup = function(event) {
  event.preventDefault();
  
  var paramsMap = {
    'url': 'feedplayback-feed-url',
    'start-date': 'feedplayback-start-date',
    'frequency': 'feedplayback-frequency'
  }
  
  var data = '';
  
  for (var paramName in paramsMap) {
    data += paramName + '=' +
        encodeURIComponent(goog.dom.$(paramsMap[paramName]).value) + '&';
  }
  
  if (data == streamspigot.feedplayback.previousSetupParams) {
    return;
  }
  
  streamspigot.feedplayback.previousSetupParams = data;
  
  goog.dom.$('feedplayback-setup').disabled = true;
  
  streamspigot.util.fetchJson(
      '/feed-playback/create',
      function(data) {
          goog.dom.$('feedplayback-setup').disabled = false;
          goog.dom.classes.remove(goog.dom.$('feedplayback-result'), 'hidden');
          goog.dom.classes.add(goog.dom.$('feedplayback-error'), 'hidden');
          
          var feedUrlNode = goog.dom.$('feedplayback-subscription-feed-url');
          feedUrlNode.href = data.feedUrl;
          var readerUrlNode = goog.dom.$('feedplayback-subscription-reader-url');
          readerUrlNode.href = data.readerUrl;
      },
      function(statusCode, responseText) {
        delete streamspigot.feedplayback.previousSetupParams;
        goog.dom.$('feedplayback-setup').disabled = false;
        goog.dom.classes.add(goog.dom.$('feedplayback-result'), 'hidden');
        goog.dom.classes.remove(goog.dom.$('feedplayback-error'), 'hidden');
        
        goog.dom.$('feedplayback-error-details-status').innerHTML =
            goog.string.htmlEscape(statusCode);
        goog.dom.$('feedplayback-error-details-response').innerHTML =
            goog.string.htmlEscape(responseText);
      },
      data);
};

streamspigot.util.fetchJson = function(url, jsonCallback, errorCallback, opt_postData) {
  var xhr = new goog.net.XhrIo();
  
  function handleError() {
    errorCallback(xhr.getStatus(), xhr.getResponseText());
  }
  
  goog.events.listen(xhr, goog.net.EventType.COMPLETE, function() {
    if (xhr.isSuccess()) {
      try {
        var json = xhr.getResponseJson();
      } catch (err) {
        handleError();
        return;
      }

      // Invoke callback in a timeout to avoid Closure's exception-catching
      // logic (we want exceptions to end up in the console).
      setTimeout(goog.partial(jsonCallback, json), 0);
    } else {
      handleError();
    }
    xhr.dispose();
  });
  
  xhr.send(url, opt_postData ? 'POST': 'GET', opt_postData);
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

streamspigot.util.getIso8601DateString = function(date) {
  function pad(n) {
    return n < 10 ? '0' + n : n;
  }
  
  return date.getFullYear() + '-' +
      pad(date.getMonth() + 1) + '-' +
      pad(date.getDate());  
}