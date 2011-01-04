import urllib

from django.utils import simplejson
from google.appengine.api import urlfetch

def lookup_feed_url(html_or_feed_url):
    json = _fetch_api_json('feed-finder', {'q': html_or_feed_url})
    if json and 'feed' in json and len(json['feed']) and 'href' in json['feed'][0]:
        return json['feed'][0]['href']
    return None

def _fetch_api_json(path, extra_params={}):
    url = 'http://www.google.com/reader/api/0/' \
        '%s?output=json&client=streamspigot&%s' % (
            path, urllib.urlencode(extra_params))
    response = urlfetch.fetch(
        url=url,
        method=urlfetch.GET,
        deadline=10)
    if response.content:
        return simplejson.loads(response.content)
    return None