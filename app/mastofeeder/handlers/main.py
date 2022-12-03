import session

class IndexHandler(session.SessionApiHandler):
    def _get_signed_in(self):
        mastodon_user = self._api.me()

        lists = self._api.lists()
        lists_and_feed_paths = [
            (l, self._get_feed_path('list', str(l.id), 'timeline'))
                for l in sorted(lists, key=lambda l: l.title)
        ]

        self._write_template('mastofeeder/index-signed-in.html', {
          'mastodon_user': mastodon_user,
          'timeline_feed_path': self._get_feed_path('timeline'),
          'lists_and_feed_paths': lists_and_feed_paths,
          'sign_out_path': self._get_path('sign-out'),
        })

    def _get_signed_out(self):
        self._write_template('mastofeeder/index-signed-out.html', {
            'sign_in_path': self._get_path('sign-in'),
        })
