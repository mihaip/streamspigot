import datetime
import itertools
import logging
import os

from google.appengine.api import taskqueue
from google.appengine.ext import db

from base.constants import CONSTANTS
import base.util
from datasources import twitter, twitterappengine
from datasources.oauth_keys import SERVICE_PROVIDERS

TWITTER_SERVICE_PROVIDER = SERVICE_PROVIDERS['birdfeeder:twitter']

class OAuthToken(db.Model):
    token = db.StringProperty(required=True)
    secret = db.StringProperty(required=True, indexed=False)

    @staticmethod
    def create(token, secret):
        return OAuthToken(token=token, secret=secret)

    @staticmethod
    def get_by_token(token):
        return OAuthToken.all().filter('token = ', token).get()

    @classmethod
    def kind(cls):
        return 'birdfeeder.OAuthToken'

def _generate_session_id():
  return base.util.generate_id('s')

def _generate_feed_id():
  return base.util.generate_id('f')

class Session(db.Model):
    session_id = db.StringProperty(required=True)
    twitter_id = db.StringProperty(required=True)
    feed_id = db.StringProperty(required=True)
    oauth_token = db.TextProperty(indexed=False)
    oauth_token_secret = db.TextProperty(indexed=False)

    def update(self, oauth_token, oauth_token_secret):
        self.session_id = _generate_session_id()
        self.oauth_token = oauth_token
        self.oauth_token_secret = oauth_token_secret

    def reset_feed_id(self):
        self.feed_id = _generate_feed_id()

    def as_dict(self):
        return {
          'session_id': self.session_id,
          'twitter_id': self.twitter_id,
          'feed_id': self.feed_id,
          'oauth_token': self.oauth_token,
          'oauth_token_secret': self.oauth_token_secret,
        }

    def create_api(self):
        api = twitter.Api(
            consumer_key=TWITTER_SERVICE_PROVIDER.consumer.key,
            consumer_secret=TWITTER_SERVICE_PROVIDER.consumer.secret,
            access_token_key=self.oauth_token,
            access_token_secret=self.oauth_token_secret,
            cache=None)
        api.SetUserAgent('StreamSpigot/%s (+%s)' % (
            os.environ.get('CURRENT_VERSION_ID', '1'),
            CONSTANTS.APP_URL,
        ))
        return api

    def create_caching_api(self):
        api = twitter.Api(
            consumer_key=TWITTER_SERVICE_PROVIDER.consumer.key,
            consumer_secret=TWITTER_SERVICE_PROVIDER.consumer.secret,
            access_token_key=self.oauth_token,
            access_token_secret=self.oauth_token_secret,
            cache=twitterappengine.MemcacheCache())
        api.SetCacheTimeout(24 * 60 * 60) # In seconds. TODO(mihaip): configure?
        api.SetUserAgent('StreamSpigot/%s (+%s)' % (
            os.environ.get('CURRENT_VERSION_ID', '1'),
            CONSTANTS.APP_URL,
        ))
        return api

    def get_timeline_feed_url(self):
        # TODO(mihaip): There's probably a better place for this.
        return '%s/bird-feeder/feed/timeline/%s' % (
            CONSTANTS.APP_URL, self.feed_id)

    def enqueue_update_task(
            self,
            countdown=None,
            expected_status_id=None,
            update_retry_count=None):
        params = {}
        if expected_status_id is not None:
            params['expected_status_id'] = expected_status_id
        if update_retry_count is not None:
            params['update_retry_count'] = update_retry_count
        params.update(self.as_dict())

        taskqueue.add(
            queue_name='birdfeeder-update',
            url='/tasks/bird-feeder/update',
            countdown=countdown,
            params=params)

    @staticmethod
    def create(twitter_id, oauth_token, oauth_token_secret):
        return Session(
            session_id=_generate_session_id(),
            twitter_id = twitter_id,
            feed_id = _generate_feed_id(),
            oauth_token = oauth_token,
            oauth_token_secret = oauth_token_secret)

    @staticmethod
    def get_by_twitter_id(twitter_id):
      return Session.all().filter('twitter_id = ', twitter_id).get()

    @staticmethod
    def get_by_session_id(session_id):
      return Session.all().filter('session_id = ', session_id).get()

    @staticmethod
    def get_by_feed_id(feed_id):
      return Session.all().filter('feed_id = ', feed_id).get()

    @staticmethod
    def from_request(request):
        return Session(
            session_id=request.get('session_id'),
            twitter_id=request.get('twitter_id'),
            feed_id=request.get('feed_id'),
            oauth_token=request.get('oauth_token'),
            oauth_token_secret=request.get('oauth_token_secret'))

    @classmethod
    def kind(cls):
        return 'birdfeeder.Session'

class StreamData(db.Model):
    status_ids = db.ListProperty(long, indexed=False)
    status_timestamps_sec = db.ListProperty(long, indexed=False)

    def status_pairs(self):
        return itertools.izip(self.status_ids, self.status_timestamps_sec)

    @staticmethod
    def get_timeline_for_user(twitter_id):
        return StreamData.get_by_key_name(
            StreamData._timeline_stream_id(twitter_id))

    @staticmethod
    def get_or_create_timeline_for_user(twitter_id):
        stream = StreamData.get_timeline_for_user(twitter_id)
        if not stream:
            stream = StreamData(
                key_name=StreamData._timeline_stream_id(twitter_id),
                status_ids=[],
                status_timestamps_sec=[])
            stream.put()
        return stream

    @staticmethod
    def _timeline_stream_id(twitter_id):
        return 'user/%s/timeline' % twitter_id

    @classmethod
    def kind(cls):
        return 'birdfeeder.StreamData'

class StatusData(db.Model):
    original_json_dict = base.util.JsonProperty(indexed=False, required=True)

    def to_status(self):
        return twitter.Status.NewFromJsonDict(self.original_json_dict)

    @staticmethod
    def get_unknown_status_ids(status_ids):
        # TODO(mihaip): it might be more efficient if this was a key-only query
        stored_statuses = StatusData.get_by_status_ids(status_ids)
        unknown_status_ids = []

        for stored_status, status_id in itertools.izip(
                stored_statuses, status_ids):
            if not stored_status:
                unknown_status_ids.append(status_id)

        return unknown_status_ids

    @staticmethod
    def get_by_status_ids(status_ids):
        return StatusData.get_by_key_name(
            StatusData._status_id_to_key(status_ids))

    @staticmethod
    def from_status(status):
        return StatusData(
            key_name=StatusData._status_id_to_key(status.id),
            original_json_dict=status.original_json_dict)

    @staticmethod
    def _status_id_to_key(status_id):
        if isinstance(status_id, list):
            return [str(id) for id in status_id]
        else:
            return str(status_id)

    @classmethod
    def kind(cls):
        return 'birdfeeder.StatusData'

class FollowingData(db.Model):
    following_map = base.util.JsonProperty(indexed=False, required=True)
    last_update_time = db.DateTimeProperty(auto_now=True)

    _SINGLETON_ID = 'following_data'
    _REFRESH_INTERVAL = datetime.timedelta(hours=1)

    _following_map = None
    _last_update_time = None

    @staticmethod
    def get_following_list():
        if FollowingData._is_stale():
            FollowingData._update()

        return list(FollowingData._following_map.keys())

    @staticmethod
    def get_following_twitter_ids(twitter_id):
        if FollowingData._is_stale():
            FollowingData._update()

        return FollowingData._following_map.get(twitter_id, [])

    @staticmethod
    def _is_stale():
        if (FollowingData._following_map is None or
            FollowingData._last_update_time is None):
            return True

        data_age = datetime.datetime.utcnow() - FollowingData._last_update_time
        return data_age > FollowingData._REFRESH_INTERVAL

    @staticmethod
    def _update():
        stored_data = FollowingData.get_by_key_name(FollowingData._SINGLETON_ID)

        if stored_data:
            # The serialized following data ends up having its keys converted to
            # strings; convert them to numbers when deserializing.
            FollowingData._following_map = {}
            for twitter_id, following_twitter_ids in stored_data.following_map.items():
                twitter_id = long(twitter_id)
                FollowingData._following_map[twitter_id] = following_twitter_ids
            FollowingData._last_update_time = stored_data.last_update_time
            if not FollowingData._is_stale():
                return

        following_map = {}
        for session in Session.all():
            twitter_id = long(session.twitter_id)
            following_twitter_ids, had_error = twitterappengine.exec_twitter_api(
                lambda: session.create_api().GetFriendIDs(user_id=twitter_id),
                error_detail='can\'t get friend IDs for %s, using stale data' %
                                session.twitter_id)

            if had_error: return

            for following_twitter_id in following_twitter_ids:
                following_map.setdefault(following_twitter_id, []).append(twitter_id)
            # Users are also considered to be following themselves (since their
            # updates update their timeline).
            following_map.setdefault(twitter_id, []).append(twitter_id)

        stored_data = FollowingData(
            key_name=FollowingData._SINGLETON_ID,
            following_map=following_map)
        stored_data.put()

        FollowingData._following_map = following_map
        FollowingData._last_update_time = stored_data.last_update_time

    @classmethod
    def kind(cls):
        return 'birdfeeder.FollowingData'
