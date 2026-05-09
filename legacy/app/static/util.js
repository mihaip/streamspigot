export function fetchJson(url, jsonCallback, errorCallback, opt_postData) {
  fetch(url, {
    method: opt_postData ? "POST" : "GET",
    body: opt_postData,
  })
    .then((response) => response.json())
    .then((json) => jsonCallback(json))
    .catch((error) => errorCallback(error));
}

export function throttle(func, minTimeMs) {
  var timeout = null;
  return function () {
    if (timeout) {
      window.clearTimeout(timeout);
    }
    timeout = window.setTimeout(function () {
      timeout = null;
      func();
    }, minTimeMs);
  };
}

export function getIso8601DateString(date) {
  function pad(n) {
    return n < 10 ? "0" + n : n;
  }

  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate())
  );
}

export function $(selector) {
  return document.querySelector(selector);
}

export function htmlEscape(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function exportFunction(path, func) {
  const parts = path.split(".");
  let obj = window;
  for (var i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    obj[part] = obj[part] || {};
    obj = obj[part];
  }
  obj[parts[parts.length - 1]] = func;
}
