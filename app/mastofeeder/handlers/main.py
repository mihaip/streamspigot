import session

class IndexHandler(session.SessionApiHandler):
    def _get_signed_in(self):
        mastodon_user = self._api.me()

        self._write_template('mastofeeder/index-signed-in.html', {
          'mastodon_user': mastodon_user,
          'timeline_feed_path': self._get_feed_path('timeline'),
          'sign_out_path': self._get_path('sign-out'),
        })

    def _get_signed_out(self):
        self._write_template('mastofeeder/index-signed-out.html', {
            'sign_in_path': self._get_path('sign-in'),
        })
