import calendar
import datetime
import itertools
import os
import re
import time
import zlib

from base.constants import CONSTANTS
from datasources import thumbnails, twitter, twitterappengine, twitterdisplay
from datasources.oauth_keys import SERVICE_PROVIDERS

TWITTER_SERVICE_PROVIDER = SERVICE_PROVIDERS['tweetdigest:twitter']
DIGEST_LENGTH_SEC = 60 * 60 * 24

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

    digest_start_time = digest_end_time - DIGEST_LENGTH_SEC

    # Twitter data can be as stale as the digest end time, since we don't care
    # about anything more recent (there may be some concurrency issues with
    # parallell invocations, but they're unlikely to actually matter at the load
    # we're expecting.
    max_cache_age = calendar.timegm(now) - digest_end_time

    return digest_start_time, digest_end_time, max_cache_age

def get_digest_dates():
    digest_start_time, digest_end_time, max_cache_age = _get_digest_timestamps()
    return (datetime.datetime.fromtimestamp(digest_start_time),
        datetime.datetime.fromtimestamp(digest_end_time))

def _process_digest_statuses(
        statuses,
        digest_start_time,
        digest_end_time,
        error_info,
        dev_mode,
        timezone=None):
    if not dev_mode:
      # Filter them for the ones that fall in the window
      digest_statuses = [
          s for s in statuses
          if s.created_at_in_seconds <= digest_end_time and
              s.created_at_in_seconds > digest_start_time
      ]
    else:
      digest_statuses = statuses

    # Order them in chronological order
    digest_statuses.sort(
        lambda x, y: int(x.created_at_in_seconds - y.created_at_in_seconds))
    if dev_mode:
        digest_statuses.reverse()

    # Group them by username
    status_groups = []
    for username, statuses in itertools.groupby(
        digest_statuses, lambda status: status.user.id):
        statuses = list(statuses)
        status_groups.append(twitterdisplay.DisplayStatusGroup(
            user=statuses[0].user,
            statuses=statuses,
            thumbnail_size=thumbnails.SMALL_THUMBNAIL,
            timezone=timezone))

    return status_groups, error_info

class TwitterFetcher(object):
    def fetch(self):
        data, had_error = twitterappengine.exec_twitter_api(
            self._fetch, error_detail=self._id())
        return data or [], had_error

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
                slug=self._list_id,
                owner_screen_name=self._list_owner,
                max_id=max_id,
                count=40,
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
    def __init__(
            self,
            api,
            username,
            digest_start_time,
            digest_end_time,
            dev_mode):
        self._api = api
        self._username = username
        self._digest_start_time = digest_start_time
        self._digest_end_time = digest_end_time
        self._dev_mode = dev_mode

    def _fetch(self):
        timeline = self._api.GetUserTimeline(
            screen_name=self._username,
            count=40)

        if not self._dev_mode:
          # We do the filtering now, so that we don't look up user objects that
          # we don't need.
          timeline = [
              s for s in timeline
              if s.created_at_in_seconds <= self._digest_end_time and
                  s.created_at_in_seconds > self._digest_start_time
          ]

        return timeline

    def _id(self):
        return 'user "%s"' % self._username

def get_digest_for_list(list_owner, list_id, dev_mode):
    digest_start_time, digest_end_time, max_cache_age = _get_digest_timestamps()

    api = _get_digest_twitter_api(
        max_cache_age, key='%s/%s' % (list_owner, list_id))

    user, had_error = twitterappengine.exec_twitter_api(
        lambda: api.GetUser(screen_name=list_owner, include_entities=False),
        error_detail='user %s' % list_owner)
    if not had_error:
        timezone = twitterdisplay.get_timezone_for_user(user)
    else:
        timezone = None

    fetcher = ListTwitterFetcher(api, list_owner, list_id, digest_start_time)
    statuses, had_error = fetcher.fetch()

    return _process_digest_statuses(
        statuses,
        digest_start_time,
        digest_end_time,
        had_error,
        dev_mode,
        timezone=timezone)

def get_digest_for_usernames(usernames, dev_mode):
    digest_start_time, digest_end_time, max_cache_age = _get_digest_timestamps()

    statuses = []
    error_usernames = []

    for username in usernames:
        api = _get_digest_twitter_api(max_cache_age, key=username)
        fetcher = UserTwitterFetcher(
            api,
            username,
            digest_start_time,
            digest_end_time,
            dev_mode)
        user_statuses, had_error = fetcher.fetch()
        if had_error:
            error_usernames.append(username)
        else:
            statuses.extend(user_statuses)

    return _process_digest_statuses(
        statuses,
        digest_start_time,
        digest_end_time,
        error_usernames,
        dev_mode,
        timezone=None)

class UserListsTwitterFetcher(TwitterFetcher):
    def __init__(self, api, username):
        self._api = api
        self._username = username

    def _fetch(self):
        return self._api.GetLists(screen_name=self._username)

    def _id(self):
        return 'lists "%s"' % self._username

def get_lists(username):
    api = _get_digest_twitter_api(3600, key=username)
    fetcher = UserListsTwitterFetcher(api, username)
    lists, had_error = fetcher.fetch()

    return had_error and None or lists

def is_valid_twitter_username(username):
    return TWITTER_USERNAME_RE.match(username) is not None
