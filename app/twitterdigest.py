import calendar
import datetime
import itertools
import logging
import os
import time
import xml.sax.saxutils

from google.appengine.api import urlfetch

import twitter
import twitterappengine

DIGEST_LENGTH = 60 * 60 * 24

def _get_digest_twitter_api(max_cache_age):
    api = twitter.Api(cache=twitterappengine.DbCache())
    api.SetCacheTimeout(max_cache_age)
    api.SetUserAgent('StreamSpigot/%s (+http://%s)' % (
        os.environ.get('CURRENT_VERSION_ID', '1'),
        os.environ.get('SERVER_NAME', 'streamspigot.appspot.com'),
    ))
    return api
    
class StatusGroup(object):
    def __init__(self, user, statuses):
        self.user = user
        self.statuses = statuses

def get_status_text_as_html(status, link_formatter):
    text_as_html = []
    entities = list(status.hashtags + status.urls + status.user_mentions)
    entities = [
        e for e in entities if e.start_index != -1 and e.end_index != -1]
    entities.sort(cmp=lambda e1,e2: e1.start_index - e2.start_index)
    last_entity_end = 0
    
    def add_raw_chunk(chunk):
        text_as_html.append(chunk)
    
    def add_escaped_chunk(chunk):
        add_raw_chunk(xml.sax.saxutils.escape(chunk))
    
    for e in entities:
      add_raw_chunk(status.text[last_entity_end:e.start_index])

      entity_anchor_text = status.text[e.start_index:e.end_index]
      entity_url = None
      
      if isinstance(e, twitter.Hashtag):
          entity_url = 'search?q=%23' + e.text
      elif isinstance(e, twitter.Url):
          entity_url = e.url
          entity_url_anchor_text = e.display_url or e.expanded_url or e.url
          if entity_url_anchor_text:
              entity_anchor_text = xml.sax.saxutils.escape(entity_url_anchor_text)
      elif isinstance(e, twitter.User):
          entity_url = e.screen_name
      
      if entity_url:
          add_raw_chunk('<a href="')
          add_escaped_chunk(entity_url)
          add_raw_chunk('" %s>' % link_formatter.get_attributes())
          add_raw_chunk(entity_anchor_text)
          add_raw_chunk('</a>')
      else:
          add_escaped_chunk(entity_anchor_text)
      
      last_entity_end = e.end_index
    
    add_raw_chunk(status.text[last_entity_end:])
    
    return ''.join(text_as_html)

def _get_digest_timestamps():
    # From the current time
    now = time.gmtime()
  
    # Go back to midnight
    digest_end_time = calendar.timegm([
      now.tm_year,
      now.tm_mon,
      now.tm_mday,
      0,
      0,
      0,
      now.tm_wday,
      now.tm_yday,
      now.tm_isdst
    ])
  
    digest_start_time = digest_end_time - DIGEST_LENGTH
  
    # Twitter data can be as stale as the digest end time, since we don't care
    # about anything more recent (there may be some concurrency issues with
    # parallell invocations, but they're unlikely to actually matter at the load
    # we're expecting.
    max_cache_age = calendar.timegm(now) - digest_end_time
    
    return digest_start_time, digest_end_time, max_cache_age

def _process_digest_statuses(
    statuses, digest_start_time, digest_end_time, link_formatter, error_info):
    # Filter them for the ones that fall in the window
    digest_statuses = [
        s for s in statuses
        if s.created_at_in_seconds <= digest_end_time and
            s.created_at_in_seconds > digest_start_time
    ]
    
    # Decorate them with the HTML representation of the text and formatted dates
    for s in digest_statuses:
        s.text_as_html = get_status_text_as_html(s, link_formatter)
        s.created_at_formatted_gmt = datetime.datetime.utcfromtimestamp(
            s.created_at_in_seconds).strftime("%I:%M %p")
    
    # Order them in chronological order
    digest_statuses.sort(
        lambda x, y: int(x.created_at_in_seconds - y.created_at_in_seconds))
  
    # Group them by username
    status_groups = []
    for username, statuses in itertools.groupby(
        digest_statuses, lambda status: status.user.id):
        statuses = list(statuses)
        status_groups.append(StatusGroup(
            user=statuses[0].user,
            statuses=statuses))
  
    return (status_groups,
            datetime.datetime.fromtimestamp(digest_start_time),
            error_info)

class TwitterFetcher(object):
    def fetch(self):
        try:
            return self._fetch(), False
        except twitter.TwitterError, err:
            logging.warning('Twitter error "%s" for %s"', err, self._id())
        except urlfetch.DownloadError, err:
            logging.warning('HTTP fetch error "%s" for %s', err, self._id())
        except ValueError, err:
            logging.warning('JSON error "%s" for %s', err, self._id())

        return [], True
        
class ListTwitterFetcher(TwitterFetcher):
    def __init__(self, api, list_owner, list_id):
        self._api = api
        self._list_owner = list_owner
        self._list_id = list_id

    def _fetch(self):
        # TODO(mihaip): keep fetching tweets if we haven't gotten enough to go
        # to digest_start_time    
        return self._api.GetListTimeline(
            self._list_owner,
            self._list_id,
            per_page=40,
            include_entities=True)
            
    def _id(self):
        return 'list "%s/%s"' % (self._list_owner, self._list_id)

class UserTwitterFetcher(TwitterFetcher):
    def __init__(self, api, username):
        self._api = api
        self._username = username
 
    def _fetch(self):
        return self._api.GetUserTimeline(
            self._username,
            count=40,
            include_rts=True,
            include_entities=True)

    def _id(self):
        return 'user "%s"' % self._username

def get_digest_for_list(list_owner, list_id, link_formatter):
    digest_start_time, digest_end_time, max_cache_age = _get_digest_timestamps()

    api = _get_digest_twitter_api(max_cache_age)
    
    fetcher = ListTwitterFetcher(api, list_owner, list_id)
    statuses, had_error = fetcher.fetch()
    
    return _process_digest_statuses(
        statuses, digest_start_time, digest_end_time, link_formatter, had_error)    
    
def get_digest_for_usernames(usernames, link_formatter):
    digest_start_time, digest_end_time, max_cache_age = _get_digest_timestamps()
  
    statuses = []
    error_usernames = []

    api = _get_digest_twitter_api(max_cache_age)
  
    for username in usernames:
        fetcher = UserTwitterFetcher(api, username)
        user_statuses, had_error = fetcher.fetch()
        if had_error:
            error_usernames.append(username)
        else:
            statuses.extend(user_statuses)

    return _process_digest_statuses(
        statuses, digest_start_time, digest_end_time, link_formatter, error_usernames)
