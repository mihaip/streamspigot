function init() {
  var tableNode = document.getElementById("usernames-table");
  
  var templateRowNode = tableNode.getElementsByTagName("tr")[0];
  
  initRow(templateRowNode);
  templateRowNode.getElementsByTagName("input")[0].focus();
  
  updateLinks();
}

function initRow(rowNode) {
  var inputNode = rowNode.getElementsByTagName("input")[0];
  inputNode.value = "";
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
  
  var buttonNodes = rowNode.getElementsByTagName("button");
  
  buttonNodes[0].disabled = buttonNodes[1].disabled = false;
  
  buttonNodes[0].onclick = function() {
    removeRow(rowNode);
  };
  buttonNodes[1].onclick = function() {
    addRow(rowNode);
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

function removeRow(currentRow) {
  currentRow.parentNode.removeChild(currentRow);
  
  updateLinks();
}

function addRow(currentRow) {
  var newRow = currentRow.cloneNode(true);
  initRow(newRow);
  
  currentRow.parentNode.insertBefore(newRow, currentRow.nextSibling);
  
  newRow.getElementsByTagName("input")[0].focus();
  
  updateLinks();
}

function updateLinks(ev) {
  var tableNode = document.getElementById("usernames-table");
  
  // Collect all usernames
  var usernameNodes = tableNode.getElementsByTagName("input");
  var usernames = [];
  
  for (var i = 0, usernameNode; usernameNode = usernameNodes[i]; i++) {
    var username = usernameNode.value;
    username = username.replace(/^\s*/, "");
    username = username.replace(/\s*$/, "");
    
    if (username) {
      usernames.push(username);
    }
  }
  
  // Update links
  var linksNode = document.getElementById("digest-links");
  var emptyNode = document.getElementById("digest-empty");
  if (usernames.length) {
    emptyNode.className = "hidden";
    linksNode.className = "";
    
    var baseUrl = 'twitter/digest?usernames=' + usernames.join("+");
    
    var htmlLinkNode = document.getElementById("digest-html-link");
    var feedLinkNode = document.getElementById("digest-feed-link");
    
    htmlLinkNode.href = baseUrl + "&output=html";
    feedLinkNode.href = baseUrl + "&output=atom";
  } else {
    emptyNode.className = "";
    linksNode.className = "hidden";
  }
  
  // Update button state (so if there's only one username, it can't be
  // removed)
  var buttons = tableNode.getElementsByTagName("button");
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
