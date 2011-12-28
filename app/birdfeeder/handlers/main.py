import urllib

from base.constants import CONSTANTS
import session

class IndexHandler(session.SessionApiHandler):
    def _get_signed_in(self):
        twitter_user = self._api.GetUser(self._session.twitter_id)

        timeline_feed_url = self._get_path(
            'feed/timeline/%s' % self._session.feed_id)
        timeline_reader_url = \
            'http://www.google.com/reader/view/feed/%s' % urllib.quote(
                CONSTANTS.APP_URL + timeline_feed_url)

        self._write_template('birdfeeder/index-signed-in.html', {
          'twitter_user': twitter_user,
          'sign_out_path': self._get_path('sign-out'),
          'timeline_feed_url': timeline_feed_url,
          'timeline_reader_url': timeline_reader_url,
        })

    def _get_signed_out(self):
        self._write_template('birdfeeder/index-signed-out.html', {
            'sign_in_path': self._get_path('sign-in'),
        })
