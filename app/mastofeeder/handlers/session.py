import Cookie
import logging
import urlparse

from base.constants import CONSTANTS
import base.handlers
from datasources import mastodon
import mastofeeder.data as data

BASE_PATH = '/masto-feeder'
SCOPES = ['read:accounts', 'read:follows', 'read:lists', 'read:statuses']

AUTH_REQUEST_COOKIE_NAME = 'mastofeeder-auth-request'

class BaseHandler(base.handlers.BaseHandler):
    def _get_path(self, path=''):
        return '%s/%s' % (BASE_PATH, path)

    def _get_url(self, path=''):
        request_url = urlparse.urlparse(self.request.url)
        return '%s://%s%s' % (
            request_url.scheme, request_url.netloc, self._get_path(path))

    def _has_cookie(self, name):
        return name in self.request.cookies

    def _get_cookie(self, name):
        return self.request.cookies[name]

    def _set_cookie(self, name, value):
        cookie = Cookie.SimpleCookie()
        cookie[name] = value
        morsel = cookie[name]
        morsel['path'] = BASE_PATH
        # TODO(mihaip): expiration?

        self.response.headers.add_header(
            'Set-Cookie', morsel.output(header='').lstrip())

    def _remove_cookie(self, name):
        cookie = Cookie.SimpleCookie()
        cookie[name] = 'expired'
        morsel = cookie[name]
        morsel['path'] = BASE_PATH
        morsel['expires'] = 'Sat, 1-Jan-2000 00:00:00'

        self.response.headers.add_header(
            'Set-Cookie', morsel.output(header='').lstrip())

class SessionHandler(BaseHandler):
    SESSION_COOKIE_NAME = 'mastofeeder-sid'

    def _has_request_session(self):
        return self._has_cookie(self.SESSION_COOKIE_NAME)

    def _get_session_from_request(self):
        session_id = self._get_cookie(self.SESSION_COOKIE_NAME)
        return data.Session.get_by_session_id(session_id)

    def _set_request_session(self, session):
        self._set_cookie(self.SESSION_COOKIE_NAME, session.session_id)

    def _remove_request_session(self):
        self._remove_cookie(self.SESSION_COOKIE_NAME)

    def _get_feed_path(self, *args):
        return self._get_path('feed/%s/%s' % (
            self._session.feed_id,
            '/'.join(args),
        ))

class SessionApiHandler(SessionHandler):
    def get(self, *args):
        self._dispatch_request(
            lambda: self._get_signed_in(), lambda: self._get_signed_out())

    def post(self, *args):
        self._dispatch_request(
            lambda: self._post_signed_in(), lambda: self._post_signed_out())

    def _dispatch_request(self, signed_in, signed_out):
        try:
            if self._has_request_session():
                session = self._get_session_from_request()

                if session:
                    self._session = session
                    self._api = session.create_api()
                    signed_in()
                    return
                else:
                    logging.info("Cannot find session")

            signed_out()
        except mastodon.MastodonNotFoundError:
            self._write_error(404)
            return


    def _get_signed_in(self):
        raise NotImplementedError()

    def _get_signed_out(self):
        raise NotImplementedError()

    def _post_signed_in(self):
        raise NotImplementedError()

    def _post_signed_out(self):
        raise NotImplementedError()

class SignInHandler(BaseHandler):

    def post(self):
        instance_url = self.request.get('instance_url')

        app = data.MastodonApp.get_by_instance_url(instance_url)
        if not app:
            try:
                client_id, client_secret = mastodon.Mastodon.create_app(
                    '%s - Masto Feeder' % CONSTANTS.APP_NAME,
                    scopes=SCOPES,
                    api_base_url=instance_url,
                    redirect_uris=[self._get_url('sign-in-callback')],
                    website=self._get_url(''),
                )
            except mastodon.MastodonNetworkError:
                self._write_input_error('Invalid instance URL %s' % instance_url)
                return
            app = data.MastodonApp.create(instance_url, client_id, client_secret)
            app.put()

        api = mastodon.Mastodon(
            client_id=app.client_id,
            client_secret=app.client_secret,
            api_base_url=instance_url,
        )

        auth_request_data = data.MastodonAuthRequest.create(
            instance_url=instance_url)
        auth_request_data.put()
        self._set_cookie(AUTH_REQUEST_COOKIE_NAME, auth_request_data.id)

        auth_request_url = api.auth_request_url(
            scopes=SCOPES,
            redirect_uris=self._get_url('sign-in-callback'),
            state=auth_request_data.id,
        )

        self.redirect(auth_request_url)


class SignInCallbackHandler(SessionHandler):
    def get(self):
        code = self.request.get('code')
        auth_request_id = self._get_cookie(AUTH_REQUEST_COOKIE_NAME)
        if not auth_request_id:
            self._write_input_error('No auth request cookie found')
            return
        self._remove_cookie(AUTH_REQUEST_COOKIE_NAME)
        state = self.request.get('state')
        # Sky Bridge does not send back the state parameter.
        if state and state != auth_request_id:
            self._write_input_error('Mismatched auth request cookie (%s) and state (%s)' % (auth_request_id, code))
            return

        auth_request_data = data.MastodonAuthRequest.get_by_id(auth_request_id)
        if not auth_request_data:
            self._write_input_error('Unknown auth request %s' % auth_request_id)
            return
        instance_url = auth_request_data.instance_url
        auth_request_data.delete()

        app = data.MastodonApp.get_by_instance_url(instance_url)
        if not app:
            self._write_input_error('Unknown app %s' % instance_url)
            return

        api = mastodon.Mastodon(
            client_id=app.client_id,
            client_secret=app.client_secret,
            api_base_url=instance_url,
        )

        access_token = api.log_in(
            code=code,
            scopes=SCOPES,
            redirect_uri=self._get_url('sign-in-callback'),
        )

        mastodon_user = api.account_verify_credentials()
        mastodon_id = mastodon_user['id']

        session = data.Session.get_by_mastodon_id(mastodon_id, instance_url)
        if session:
            session.update(access_token)
        else:
            session = data.Session.create(
                mastodon_id, instance_url, access_token)
        session.put()

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
