import logging
import urllib

from django.utils import simplejson
from google.appengine.api import urlfetch

import oauth2 as oauth
import google_oauth_keys

READER_OAUTH_CLIENT = oauth.Client(
    oauth.Consumer(
        key=google_oauth_keys.CONSUMER_KEY,
        secret=google_oauth_keys.CONSUMER_SECRET),
    token=oauth.Token(
        key=google_oauth_keys.READER_ACCESS_TOKEN_KEY,
        secret=google_oauth_keys.READER_ACCESS_TOKEN_SECRET))
FEED_PLAYBACK_USER_ID = '07254461334580145372'

class ItemRef(object):
    def __init__(self, id, timestamp_usec):
        self.id = id
        self.timestamp_usec = timestamp_usec

def lookup_feed_url(html_or_feed_url):
    json = _fetch_api_json('feed-finder', {'q': html_or_feed_url})
    if json and 'feed' in json and len(json['feed']) and 'href' in json['feed'][0]:
        return json['feed'][0]['href']
    return None

def lookup_feed_title(feed_url):
    json = _fetch_api_json('stream/contents/feed/%s' % urllib.quote(feed_url))
    if json and 'title' in json:
        return json['title']
    return None

def get_feed_item_refs(feed_url, oldest_timestamp_usec=None):
    params = {
      's': 'feed/%s' % feed_url,
      'n': '10000',
    }
    if oldest_timestamp_usec:
        params['ot'] = int(oldest_timestamp_usec/1000000)

    json = _fetch_api_json('stream/items/ids', params)

    if not json:
      return None

    item_refs = []
    
    for json_item_ref in json['itemRefs']:
        item_refs.append(ItemRef(
            json_item_ref['id'], long(json_item_ref['timestampUsec'])))

    # Do additional filtering here since we may get extra items due to
    # precision-loss when coverting to seconds above.
    if oldest_timestamp_usec:
        item_refs = [i for i in item_refs
            if i.timestamp_usec > oldest_timestamp_usec]

    item_refs.sort(lambda a, b: int(a.timestamp_usec - b.timestamp_usec))

    return item_refs

def create_note(title, body, share=True, additional_stream_ids=[]):
    _post_to_api(
        'item/edit',
        {
          'title': title,
          'snippet': body,
          'share': share and 'true' or 'false',
          'tags': additional_stream_ids,
          'linkify': 'false',
        })

def _get_post_token():
    resp, content = READER_OAUTH_CLIENT.request(
        'http://www.google.com/reader/api/0/token', 'GET')
    return content.strip()

def _post_to_api(path, params):
    token = _get_post_token()
    url = 'http://www.google.com/reader/api/0/%s?client=streamspigot' % path
    params['T'] = token
    
    resp, content = READER_OAUTH_CLIENT.request(
        url, 'POST', body=urllib.urlencode(params, doseq=True))
        
    if resp.status != 200:
      logging.warning('POST response: %s\n%s\nto request:%s' % (
          str(resp), content), str(params))
    
def _fetch_api_json(path, extra_params={}):
    url = 'http://www.google.com/reader/api/0/' \
        '%s?output=json&client=streamspigot&%s' % (
            path, urllib.urlencode(extra_params, doseq=True))
    logging.info('Google Reader API request: %s' % url)
    response = urlfetch.fetch(
        url=url,
        method=urlfetch.GET,
        deadline=10)
    if response.content:
        return simplejson.loads(response.content)
    return None
    
