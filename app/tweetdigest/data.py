import calendar
import datetime
import itertools
import logging
import os
import re
import time
import xml.sax.saxutils
import zlib

from google.appengine.api import urlfetch

from base.constants import CONSTANTS
from datasources import twitter, twitterappengine
from datasources.oauth_keys import SERVICE_PROVIDERS

TWITTER_SERVICE_PROVIDER = SERVICE_PROVIDERS['twitter']
DIGEST_LENGTH = 60 * 60 * 24

TWITTER_USERNAME_RE = re.compile('^[a-zA-Z0-9_]{1,15}$')

def _get_digest_twitter_api(max_cache_age, key):
    # We don't actually need to use authentication for any of the data that
    # we fetch, but then we end up with IP address-based rate limiting, which
    # is depleted very quickly on App Engine (where there aren't a lot of
    # externally visible IP addresses). We therefore authenticate anyway, and we
    # spread that load over a few accounts. To ensure consistency (since
    # python-twitter incorporates the access token in the cache key), we always
    # want to consistently use the same access token for the same request, hence
    # the hashing based on the key that's passed in.
    access_token = TWITTER_SERVICE_PROVIDER.access_tokens[
        zlib.adler32(key.encode('utf-8')) %
            len(TWITTER_SERVICE_PROVIDER.access_tokens)]

    api = twitter.Api(
        consumer_key=TWITTER_SERVICE_PROVIDER.consumer.key,
        consumer_secret=TWITTER_SERVICE_PROVIDER.consumer.secret,
        access_token_key=access_token.key,
        access_token_secret=access_token.secret,
        cache=twitterappengine.MemcacheCache())
    api.SetCacheTimeout(max_cache_age)
    api.SetUserAgent('StreamSpigot/%s (+%s)' % (
        os.environ.get('CURRENT_VERSION_ID', '1'),
        CONSTANTS.APP_URL,
    ))
    return api

class StatusGroup(object):
    def __init__(self, user, statuses):
        self.user = user
        self.statuses = statuses

def get_status_text_as_html(status, link_formatter):
    text_as_html = []
    footer_as_html = []

    def add_raw_chunk(chunk):
        text_as_html.append(chunk)

    def add_tweet_chunk(chunk):
        # Twitter escapes < and > in status texts, but not & (see
        # http://code.google.com/p/twitter-api/issues/detail?id=1695). Unescape
        # then and re-escape everything so that we can have a consistent level
        # of escaping (we also unescape &amp; in case the Twitter bug does get
        # fixed).
        add_escaped_chunk(
            chunk.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&'))

    def add_escaped_chunk(chunk):
        add_raw_chunk(xml.sax.saxutils.escape(chunk))

    def add_footer_raw_chunk(chunk):
        footer_as_html.append(chunk)

    # For native retweets, render retweeted status, so that the RT prefix is
    # not counted against the 140 character limit and so that we get media
    # entities.
    if status.retweeted_status:
        status = status.retweeted_status
        add_raw_chunk('RT: <a href="')
        add_escaped_chunk(status.user.screen_name)
        add_raw_chunk('">@')
        add_escaped_chunk(status.user.screen_name)
        add_raw_chunk('</a>: ')

    entities = list(
        (status.hashtags or []) +
        (status.urls or []) +
        (status.user_mentions or []) +
        (status.medias or []))
    entities = [
        e for e in entities if e.start_index != -1 and e.end_index != -1]
    entities.sort(cmp=lambda e1,e2: e1.start_index - e2.start_index)
    last_entity_end = 0

    for e in entities:
      add_tweet_chunk(status.text[last_entity_end:e.start_index])

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
      elif isinstance(e, twitter.Media):
          entity_url = e.url
          entity_url_anchor_text = e.display_url or e.expanded_url or e.url
          if entity_url_anchor_text:
              entity_anchor_text = xml.sax.saxutils.escape(entity_url_anchor_text)
          if e.type == 'photo':
            # Appending /large seems to generate a lightbox view of that image
            link_url = e.expanded_url + '/large'
            thumb_url, thumb_width, thumb_height = \
                e.GetUrlForSize(twitter.Media.THUMB_SIZE)
            add_footer_raw_chunk(
                '<a href="%s" border="0">'
                  '<img src="%s" width="%d" height="%d" alt="">'
                '</a>' %
                (link_url , thumb_url, thumb_width, thumb_height))

      if entity_url:
          add_raw_chunk('<a href="')
          add_escaped_chunk(entity_url)
          add_raw_chunk('" %s>' % link_formatter.get_attributes())
          add_tweet_chunk(entity_anchor_text)
          add_raw_chunk('</a>')
      else:
          add_tweet_chunk(entity_anchor_text)

      last_entity_end = e.end_index

    add_tweet_chunk(status.text[last_entity_end:])

    result = ''.join(text_as_html)
    if footer_as_html:
      result += '<p>' + ''.join(footer_as_html) + '</p>'
    return result

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
    def __init__(self, api, list_owner, list_id, digest_start_time):
        self._api = api
        self._list_owner = list_owner
        self._list_id = list_id
        self._digest_start_time = digest_start_time

    def _fetch(self):
        statuses = []
        while True:
            max_id = len(statuses) and statuses[-1].id - 1 or None
            chunk = self._api.GetListTimeline(
                self._list_owner,
                self._list_id,
                max_id=max_id,
                per_page=40,
                include_rts=True,
                include_entities=True)
            statuses.extend(chunk)
            if not chunk or \
                chunk[-1].created_at_in_seconds < self._digest_start_time:
                break
        return statuses

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

    api = _get_digest_twitter_api(
        max_cache_age, key='%s/%s' % (list_owner, list_id))

    fetcher = ListTwitterFetcher(api, list_owner, list_id, digest_start_time)
    statuses, had_error = fetcher.fetch()

    return _process_digest_statuses(
        statuses, digest_start_time, digest_end_time, link_formatter, had_error)

def get_digest_for_usernames(usernames, link_formatter):
    digest_start_time, digest_end_time, max_cache_age = _get_digest_timestamps()

    statuses = []
    error_usernames = []

    for username in usernames:
        api = _get_digest_twitter_api(max_cache_age, key=username)
        fetcher = UserTwitterFetcher(api, username)
        user_statuses, had_error = fetcher.fetch()
        if had_error:
            error_usernames.append(username)
        else:
            statuses.extend(user_statuses)

    return _process_digest_statuses(
        statuses, digest_start_time, digest_end_time, link_formatter, error_usernames)

class UserListsTwitterFetcher(TwitterFetcher):
    def __init__(self, api, username):
        self._api = api
        self._username = username

    def _fetch(self):
        return self._api.GetLists(self._username)

    def _id(self):
        return 'lists "%s"' % self._username

def get_lists(username):
    api = _get_digest_twitter_api(3600, key=username)
    fetcher = UserListsTwitterFetcher(api, username)
    lists, had_error = fetcher.fetch()

    return had_error and None or lists

def is_valid_twitter_username(username):
    return TWITTER_USERNAME_RE.match(username) is not None
