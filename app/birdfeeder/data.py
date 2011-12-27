from google.appengine.ext import db

import base.util

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

    @classmethod
    def kind(cls):
        return 'birdfeeder.Session'
