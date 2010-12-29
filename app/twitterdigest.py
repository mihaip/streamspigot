import calendar
import datetime
import itertools
import logging
import os
import time

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

def get_digest(usernames):
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
    # about anything more recent
    max_cache_age = calendar.timegm(now) - digest_end_time
  
    # There may be some concurrency issues with parallell invocations, but they're
    # unlikely to actually matter at the load we're expecting
  
    # Now fetch the statuses
    statuses = []
    error_usernames = []

    api = _get_digest_twitter_api(max_cache_age)
  
    for username in usernames:
        try:
            statuses.extend(api.GetUserTimeline(username, count=40))
        except twitter.TwitterError, err:
            logging.warning('Twitter error "%s" for user "%s"', err, username)
            error_usernames.append(username)
            pass
        except urlfetch.DownloadError, err:
            logging.warning('HTTP fetch error "%s" for user "%s"', err, username)
            error_usernames.append(username)
            pass
        except ValueError, err:
            logging.warning('JSON error "%s" for user "%s"', err, username)
            error_usernames.append(username)
            pass
  
    # Filter them for the ones that fall in the window
    digest_statuses = [
        s for s in statuses
        if s.created_at_in_seconds <= digest_end_time and
            s.created_at_in_seconds > digest_start_time
    ]
    
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
            error_usernames)
