'''Helper code for running python-twitter on top of Google App Engine'''

import logging
import time

from django.utils import simplejson
from google.appengine.api import memcache
from google.appengine.api import urlfetch
from google.appengine.ext import db
from google.appengine.runtime import DeadlineExceededError

from datasources import twitter

class _DbCacheEntry(db.Model):
    value = db.BlobProperty(required=True, indexed=False)
    timestamp = db.DateTimeProperty(required=True, auto_now=True, indexed=False)

class DbCache(object):
    '''Simple cache on top of Google App Engine's datastore'''
    def Get(self, key):
        entry = _DbCacheEntry.get_by_key_name(key)
        if entry:
            return entry.value
        else:
            return None

    def Set(self, key, data):
        entry = _DbCacheEntry.get_by_key_name(key)
        if not entry:
            entry = _DbCacheEntry(
                key_name = key,
                value = data)
        else:
            entry.value = data
        entry.put()

    def GetCachedTime(self, key):
        entry = _DbCacheEntry.get_by_key_name(key)
        if entry:
            try:
              # All cached data must be valid JSON, and if we mistakenly cache
              # error response, we should ignore them
              data = simplejson.loads(entry.value)
              if isinstance(data, dict) and data.has_key('error'):
                return None
            except:
              return None

            return time.mktime(entry.timestamp.utctimetuple())
        else:
            return None

        return None

class MemcacheCache(object):
    '''Simple cache on top of Google App Engine's memcache service'''

    def __init__(self):
        # Keep track of the most recently read or written cache entry. For cache
        # hits, python-twitter will end up calling GetCachedTime and then
        # immediately Get. Keeping track of the last request allows the second
        # memcache RPC to be avoided.
        self._last_request_key = None
        self._last_request_value = None

    def Get(self, key):
        if key == self._last_request_key:
          return self._last_request_value
        else:
          self._last_request_key = None
          self._last_request_value = None

        values = memcache.get(key)
        if values:
            self._last_request_key = key
            self._last_request_value = values[1]
            return values[1]
        return None

    def Set(self, key, data):
        self._last_request_key = key
        self._last_request_value = data
        memcache.set(key, [time.time(), data])

    def GetCachedTime(self, key):
        values = memcache.get(key)
        if values:
            self._last_request_key = key
            self._last_request_value = values[1]
            return values[0]
        self._last_request_key = None
        self._last_request_value = None
        return None

def exec_twitter_api(func, error_detail=''):
    if error_detail:
        error_detail = ' (for %s)' % error_detail
    try:
        return func(), False
    except twitter.TwitterError, err:
        logging.warning('Twitter error "%s"%s', err, error_detail)
    except urlfetch.DownloadError, err:
        logging.warning('HTTP fetch error "%s"%s', err, error_detail)
    except urlfetch.DeadlineExceededError, err:
        logging.warning('HTTP deadline exceeded error "%s"%s', err, error_detail)
    except ValueError, err:
        logging.warning('JSON error "%s"%s', err, error_detail)
    except DeadlineExceededError, err:
        logging.warning('Deadline exceeded "%s"%s', err, error_detail)

    return None, True