import session

class IndexHandler(session.SessionApiHandler):
    def _get_signed_in(self):
        twitter_user = self._api.GetUser(self._session.twitter_id)
        self._write_template('birdfeeder/index-signed-in.html', {
          'twitter_user': twitter_user,
          'sign_out_path': self._get_path('sign-out'),
        })

    def _get_signed_out(self):
        self._write_template('birdfeeder/index-signed-out.html', {
            'sign_in_path': self._get_path('sign-in'),
        })
