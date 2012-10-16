import logging
import urllib

from django.utils import simplejson
from google.appengine.api import memcache
from google.appengine.api import urlfetch

import base.util
from oauth_keys import SERVICE_PROVIDERS

READER_OAUTH_CLIENT = \
    SERVICE_PROVIDERS['feedplayback:googlereader'].get_oauth_client()
FEED_PLAYBACK_USER_ID = '07254461334580145372'
MEMCACHE_NAMESPACE = 'googlereader'

class ItemRef(object):
    def __init__(self, id, timestamp_usec):
        self.id = id
        self.timestamp_usec = timestamp_usec

# TODO(mihaip): add more fields as they become necessary
class ItemContents(object):
    def __init__(self, title_html, url):
        self.title_html = title_html
        self.url = url

    def as_json_dict(self):
        return {
            'titleHtml': self.title_html,
            'url': self.url,
        }

def lookup_feed_url(html_or_feed_url):
    json = _fetch_api_json('feed-finder', {'q': html_or_feed_url})
    if json and 'feed' in json and len(json['feed']) and 'href' in json['feed'][0]:
        return json['feed'][0]['href']
    return None

def lookup_feed_title(feed_url):
    json = _fetch_api_json('stream/contents/feed/%s' % urllib.quote(feed_url))
    if json and 'title' in json:
        return base.util.unescape_html(json['title'])
    return None

def get_item_contents(item_id):
    json = _post_to_api('stream/items/contents', {'i': item_id})
    if json and len(json.get('items', [])) > 0:
        item_json = json['items'][0]
        title = item_json.get('title', None)
        url = len(item_json.get('alternate', [])) > 0 and item_json['alternate'][0]['href'] or None
        return ItemContents(title, url)
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

    item_refs.sort(lambda a, b: cmp(a.timestamp_usec, b.timestamp_usec))

    return item_refs

def create_note(
    title,
    body,
    url=None,
    source_url=None,
    source_title=None,
    share=True,
    additional_stream_ids=[]):
    params = {
      'title': title,
      'snippet': body,
      'share': share and 'true' or 'false',
      'linkify': 'false',
    }

    if additional_stream_ids:
        params['tags'] = additional_stream_ids

    if url:
        params['url'] = url

    if source_url:
        params['srcUrl'] = source_url

    if source_title:
        params['srcTitle'] = source_title

    _post_to_api('item/edit', params)

def set_stream_public(stream_id, is_public):
    _post_to_api('tag/edit', {
        's': stream_id,
        'pub': is_public and 'true' or 'false'
    })

def edit_item_tags(item_id, origin_stream_id, add_tags=[], remove_tags=[]):
    params = {
        'i': item_id,
        's': origin_stream_id,
    }

    if add_tags:
        params['a'] = add_tags
    if remove_tags:
        params['r'] = remove_tags

    _post_to_api('edit-tag', params)

def crawl_on_demand(feed_url):
  return _fetch_api_json(
      path='stream/contents/feed/%s' % urllib.quote(feed_url),
      extra_params={'refresh': 'true'},
      signed_in=True)

def _get_post_token():
    URL = 'http://www.google.com/reader/api/0/token'
    cached_token = memcache.get(key=URL, namespace=MEMCACHE_NAMESPACE)
    if cached_token:
      return cached_token

    resp, content = READER_OAUTH_CLIENT.request(URL, 'GET')
    token = content.strip()
    memcache.set(
        key=URL, value=token, time=20 * 60, namespace=MEMCACHE_NAMESPACE)
    return token

def _encode_params(params):
  def encode(s):
    return isinstance(s, unicode) and s.encode('utf-8') or s

  encoded_params = {}
  for key, value in params.items():
    if isinstance(value, list):
      value = [encode(v) for v in value]
    else:
      value = encode(value)
    encoded_params[encode(key)] = value
  return urllib.urlencode(encoded_params, doseq=True)

def _post_to_api(path, params):
    token = _get_post_token()
    url = 'http://www.google.com/reader/api/0/%s?client=streamspigot' % path
    params['T'] = token
    logging.info('Google Reader API POST request: %s %s' % (url, str(params)))

    resp, content = READER_OAUTH_CLIENT.request(
        url, 'POST', body=_encode_params(params))

    if resp.status != 200:
      logging.warning('POST response: %s\n%s\nto request:%s %s' % (
          str(resp), content, path, str(params)))
      return None

    try:
        return simplejson.loads(content)
    except ValueError, err:
        logging.warning('Could not parse response as JSON: %s' % content)
        return None

def _fetch_api_json(path, extra_params={}, signed_in=False):
    url = 'http://www.google.com/reader/api/0/' \
        '%s?output=json&client=streamspigot&%s' % (
            path, _encode_params(extra_params))
    logging.info('Google Reader API request: %s' % url)
    if signed_in:
      response, content = READER_OAUTH_CLIENT.request(url, 'GET')
      status = response.status
    else:
        response = urlfetch.fetch(
            url=url,
            method=urlfetch.GET,
            deadline=10)
        content = response.content
        status = response.status_code

    if status >= 400:
        logging.warning('Got error status code %d' % status)
        return None

    if content:
        try:
            return simplejson.loads(content)
        except ValueError, err:
            logging.warning('Could not parse response as JSON: %s' % content)

    return None

