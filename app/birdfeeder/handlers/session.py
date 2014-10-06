import Cookie
import logging
import urllib
import urlparse

import datasources.oauth2 as oauth

import base.handlers
from datasources.oauth_keys import SERVICE_PROVIDERS
import birdfeeder.data as data

# parse_qsl moved to urlparse module in v2.6
try:
  from urlparse import parse_qsl
except:
  from cgi import parse_qsl

TWITTER_SERVICE_PROVIDER = SERVICE_PROVIDERS['birdfeeder:twitter']
TWITTER_OAUTH_CLIENT = TWITTER_SERVICE_PROVIDER.get_oauth_client()

BASE_PATH = '/bird-feeder'

WHITELISTED_TWITTER_IDS = [
  '28203', # mihai
  '17116881', # annparparita
  '5634412', # robot_friend
  '233087105', # streamspigot
]

class BaseHandler(base.handlers.BaseHandler):
    def _get_path(self, path=''):
        return '%s/%s' % (BASE_PATH, path)

class SessionHandler(BaseHandler):
    SESSION_COOKIE_NAME = 'sid'

    def _has_request_session(self):
        return self.SESSION_COOKIE_NAME in self.request.cookies

    def _get_session_from_request(self):
        return data.Session.get_by_session_id(
            self.request.cookies[self.SESSION_COOKIE_NAME])

    def _set_request_session(self, session):
        cookie = Cookie.SimpleCookie()
        cookie[self.SESSION_COOKIE_NAME] = session.session_id
        morsel = cookie[self.SESSION_COOKIE_NAME]
        morsel['path'] = BASE_PATH
        # TODO(mihaip): expiration?

        self.response.headers.add_header(
            'Set-Cookie', morsel.output(header='').lstrip())

    def _remove_request_session(self):
        cookie = Cookie.SimpleCookie()
        cookie[self.SESSION_COOKIE_NAME] = 'expired'
        morsel = cookie[self.SESSION_COOKIE_NAME]
        morsel['path'] = BASE_PATH
        morsel['expires'] = 'Sat, 1-Jan-2000 00:00:00'

        self.response.headers.add_header(
            'Set-Cookie', morsel.output(header='').lstrip())

class SessionApiHandler(SessionHandler):
    def get(self, *args):
        self._dispatch_request(
            lambda: self._get_signed_in(), lambda: self._get_signed_out())

    def post(self, *args):
        self._dispatch_request(
            lambda: self._post_signed_in(), lambda: self._post_signed_out())

    def _dispatch_request(self, signed_in, signed_out):
        if self._has_request_session():
            session = self._get_session_from_request()

            if session and session.twitter_id in WHITELISTED_TWITTER_IDS:
                self._session = session
                self._api = session.create_api()
                self._caching_api = session.create_caching_api()
                signed_in()
                return
            else:
                self._remove_request_session()

        signed_out()

    def _get_signed_in(self):
        raise NotImplementedError()

    def _get_signed_out(self):
        raise NotImplementedError()

    def _post_signed_in(self):
        raise NotImplementedError()

    def _post_signed_out(self):
        raise NotImplementedError()

class SignInHandler(BaseHandler):
    def get(self):
        request_url = urlparse.urlparse(self.request.url)
        callback_url = '%s://%s%s' % (
            request_url.scheme, request_url.netloc, self._get_path('callback'))
        resp, content = TWITTER_OAUTH_CLIENT.request(
            TWITTER_SERVICE_PROVIDER.request_token_url,
            'POST',
            body=urllib.urlencode({'oauth_callback': callback_url}))

        if resp['status'] != '200':
            self._write_error(400)
            self.response.out.write(
                'Invalid response requesting temp token: %s\n%s' % (
                resp['status'], content))
            return
        else:
            request_token_response = dict(parse_qsl(content))

        request_token = request_token_response['oauth_token']
        request_token_secret = request_token_response['oauth_token_secret']

        request_token_data = data.OAuthToken.create(
            token=request_token, secret=request_token_secret)
        request_token_data.put()

        self.redirect('%s?oauth_token=%s' % (
            TWITTER_SERVICE_PROVIDER.authentication_url,
            urllib.quote_plus(request_token)))

class CallbackHandler(SessionHandler):
    def get(self):
        # Extract parameters.
        request_token = self.request.get('oauth_token')
        request_token_verifier = self.request.get('oauth_verifier')

        # Look up request token secret.
        request_token_data = data.OAuthToken.get_by_token(request_token)
        if not request_token_data:
            self._write_input_error('Unknown request token %s' % request_token)
            return
        request_token_secret = request_token_data.secret
        request_token_data.delete()

        # Request access token using request token.
        client_request_token = oauth.Token(request_token, request_token_secret)
        client_request_token.set_verifier(request_token_verifier)

        oauth_client = oauth.Client(
            TWITTER_SERVICE_PROVIDER.consumer, client_request_token)
        resp, content = oauth_client.request(
            TWITTER_SERVICE_PROVIDER.access_token_url,
            method='POST',
            body=urllib.urlencode({'oauth_verifier': request_token_verifier}))

        if resp['status'] != '200':
            self._write_error(400)
            self.response.out.write(
                'Invalid response requesting access token: %s\n%s' % (
                resp['status'], content))
            return
        else:
            access_token_response = dict(parse_qsl(content))

        twitter_id = access_token_response['user_id']
        access_token = access_token_response['oauth_token']
        access_token_secret = access_token_response['oauth_token_secret']

        if not twitter_id in WHITELISTED_TWITTER_IDS:
          self.redirect(self._get_path())
          return

        session = data.Session.get_by_twitter_id(twitter_id)
        if session:
            session.update(access_token, access_token_secret)
        else:
            session = data.Session.create(
                twitter_id, access_token, access_token_secret)
        session.put()
        session.enqueue_update_task()

        self._set_request_session(session)

        self.redirect(self._get_path())

class SignOutHandler(SessionHandler):
    def get(self):
        self._remove_request_session()
        self.redirect(self._get_path())

class ResetFeedIdHandler(SessionApiHandler):
    def _post_signed_in(self):
        self._session.reset_feed_id()
        self._session.put()
        self.response.out.write('OK')

    def _get_signed_out(self):
        self._write_error(403)
