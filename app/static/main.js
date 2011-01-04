function init() {
  initList();
  initUsernames();
  
  updateLinks();
}

function initList() {
  var listOwnerNode = document.getElementById('twitter-list-owner');
  var fetchTwitterListsTimeout = null;
  listOwnerNode.onkeyup = function() {
      if (fetchTwitterListsTimeout) {
        window.clearTimeout(fetchTwitterListsTimeout);
      }
      fetchTwitterListsTimeout = window.setTimeout(function() {
          fetchTwitterListsTimeout = null;
          fetchTwitterLists();
      }, 500);
  };
  
  var listsNode = document.getElementById('twitter-lists');
  listsNode.onchange = updateLinks;
}

function fetchTwitterLists() {
  var listOwnerNode = document.getElementById('twitter-list-owner');
  var listsNode = document.getElementById('twitter-lists');
  for (var i = listsNode.options.length - 1; i >= 1; i--) {
    listsNode.removeChild(listsNode.options[i]);
  }
  listsNode.options[0].innerHTML = 'Loading...';
  listsNode.disabled = true;
  var listOwner = listOwnerNode.value;
  
  if (!listOwner) return;
  
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          listsNode.options[0].innerHTML = 'Lists';
          var lists = eval('(' + xhr.responseText + ')');
          for (var i = 0; i < lists.length; i++) {
            var listOptionNode = document.createElement('option');
            listOptionNode.value = lists[i];
            listOptionNode.appendChild(document.createTextNode(lists[i]));
            listsNode.appendChild(listOptionNode);
          }
          if (lists.length) {
            listsNode.disabled = false;
          }
      } else {
        listsNode.options[0].innerHTML = 'Error';        
      }
    }
  };
  xhr.open(
      'GET',
      '/twitter-digest/lists?username=' + encodeURIComponent(listOwner),
      true);
  xhr.send(null);

  console.log('fetching twitter lists for ' + listOwnerNode.value);
}

function initUsernames() {
  var usernamesNode = document.getElementById('usernames');
  var templateRowNode = usernamesNode.getElementsByTagName('div')[0];
  initUsernameRow(templateRowNode);
}

function initUsernameRow(rowNode) {
  var inputNode = rowNode.getElementsByTagName('input')[0];
  inputNode.value = '';
  inputNode.onkeyup = function(ev) {
    var e = ev || window.event;
    
    // Enter should add a new row
    if (e.keyCode == 13) {
      var inputNode = ev.target || ev.srcElement;
      if (inputNode) {
        var rowNode = inputNode.parentNode.parentNode;
        addRow(rowNode);
        return;
      }
    }  
    
    updateLinks();
  };
  
  var buttonNodes = rowNode.getElementsByTagName('button');
  
  buttonNodes[0].disabled = buttonNodes[1].disabled = false;
  
  buttonNodes[0].onclick = function() {
    removeUsernameRow(rowNode);
  };
  buttonNodes[1].onclick = function() {
    addUsernameRow(rowNode);
  };
  
  // Prevent focusing of buttons (to remove dotted border outline, which
  // can't seem to be removed with just CSS)
  buttonNodes[0].onfocus = function() {
    buttonNodes[0].blur();
  }
  
  buttonNodes[1].onfocus = function() {
    buttonNodes[1].blur();
  };
}

function removeUsernameRow(currentRow) {
  currentRow.parentNode.removeChild(currentRow);
  
  updateLinks();
}

function addUsernameRow(currentRow) {
  var newRow = currentRow.cloneNode(true);
  initUsernameRow(newRow);
  
  currentRow.parentNode.insertBefore(newRow, currentRow.nextSibling);
  
  newRow.getElementsByTagName('input')[0].focus();
  
  updateLinks();
}

function updateLinks(ev) {
  // See if a list was selected
  var listOwnerNode = document.getElementById('twitter-list-owner');
  var listOwner = listOwnerNode.value;
  var listId = null;
  if (listOwner) {
    var listsNode = document.getElementById('twitter-lists');
    if (listsNode.selectedIndex > 0) {
      listId = listsNode.options[listsNode.selectedIndex].value;
    }
  }
  
  // Collect all usernames
  var usernamesNode = document.getElementById('usernames');
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
  var linksNode = document.getElementById('digest-links');
  var emptyNode = document.getElementById('digest-empty');
  if ((listOwner && listId) || usernames.length) {
    emptyNode.className = 'hidden';
    linksNode.className = '';
    
    var baseUrl = 'digest?';
    
    if (listOwner && listId) {
      baseUrl += 'list=' + listOwner + '/' + listId;
    } else {
      baseUrl += 'usernames=' + usernames.join('+');
    }

    var htmlLinkNode = document.getElementById('digest-html-link');
    var feedLinkNode = document.getElementById('digest-feed-link');
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
}

function printEmail(opt_anchorText) {
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
}
