import os

from google.appengine.ext import db

from base.constants import CONSTANTS
import base.util
from datasources import mastodon

class MastodonApp(db.Model):
    instance_url = db.StringProperty(required=True)
    client_id = db.StringProperty(required=True, indexed=False)
    client_secret = db.StringProperty(required=True, indexed=False)

    @staticmethod
    def get_by_instance_url(instance_url):
      return MastodonApp.all().filter('instance_url = ', instance_url).get()

    @staticmethod
    def create(instance_url, client_id, client_secret):
        return MastodonApp(
            instance_url=instance_url,
            client_id=client_id,
            client_secret=client_secret)

    @classmethod
    def kind(cls):
        return 'mastofeeder.MastodonApp'

class MastodonAuthRequest(db.Model):
    id = db.StringProperty(required=True)
    instance_url = db.StringProperty(required=True, indexed=False)

    @staticmethod
    def create(instance_url):
        return MastodonAuthRequest(id=base.util.generate_id('a'), instance_url=instance_url)

    @staticmethod
    def get_by_id(token):
        return MastodonAuthRequest.all().filter('id = ', token).get()

    @classmethod
    def kind(cls):
        return 'mastofeeder.MastodonAuthRequest'

class Session(db.Model):
    session_id = db.StringProperty(required=True)
    mastodon_id = db.IntegerProperty(required=True)
    instance_url = db.StringProperty(required=True)
    feed_id = db.StringProperty(required=True)
    access_token = db.StringProperty(indexed=False)

    def update(self, access_token):
        self.access_token = access_token

    def reset_feed_id(self):
        self.feed_id = _generate_feed_id()

    def create_api(self):
        app = MastodonApp.get_by_instance_url(self.instance_url)
        return mastodon.Mastodon(
            client_id=app.client_id,
            client_secret=app.client_secret,
            api_base_url=app.instance_url,
            access_token=self.access_token,
            user_agent='StreamSpigot/%s (+%s)' % (
            os.environ.get('CURRENT_VERSION_ID', '1'),
            CONSTANTS.APP_URL))

    @staticmethod
    def get_by_session_id(session_id):
      return Session.all().filter('session_id = ', session_id).get()

    @staticmethod
    def get_by_mastodon_id(mastodon_id, instance_url):
      return Session.all().filter('mastodon_id = ', mastodon_id).filter('instance_url = ', instance_url).get()

    @staticmethod
    def get_by_feed_id(feed_id):
      return Session.all().filter('feed_id = ', feed_id).get()

    @staticmethod
    def create(mastodon_id, instance_url, access_token):
        return Session(
            session_id=_generate_session_id(),
            feed_id=_generate_feed_id(),
            mastodon_id=mastodon_id,
            instance_url=instance_url,
            access_token=access_token)

    @classmethod
    def kind(cls):
        return 'mastofeeder.Session'

def _generate_session_id():
  return base.util.generate_id('s')

def _generate_feed_id():
  return base.util.generate_id('f')
