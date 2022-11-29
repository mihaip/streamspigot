import datetime
import logging

from mastofeeder import data
from datasources import mastodondisplay, thumbnails
import session

# Overrides the session accessors from SessionHandler to key the session
# on the feed ID in the URL, instead of the SID cookie.
class FeedHandler(session.SessionApiHandler):
    def _get_feed_id(self):
        path = self.request.path.split('/')
        return path[3] # /masto-feeder/feed/<id>/...

    def _has_request_session(self):
        return self._get_feed_id()

    def _get_session_from_request(self):
        return data.Session.get_by_feed_id(self._get_feed_id())

    def _get_signed_out(self):
        self._write_error(403)

class TimelineFeedHandler(FeedHandler):
    def _get_signed_in(self):

        include_status_json = self.request.get('include_status_json') == 'true'

        mastodon_id = self._session.mastodon_id
        logging.info('Serving timeline feed for %s' % mastodon_id)

        mastodon_user = self._api.me()
        statuses = self._api.timeline_home(limit=40)

        display_statuses = mastodondisplay.DisplayStatus.wrap(
            statuses, thumbnails.LARGE_THUMBNAIL, self._session.timezone())

        logging.info('  Feed has %d items' % len(display_statuses))

        # TODO: if-modified-since support
        updated_date = datetime.datetime.utcnow()

        params = {
            'feed_title': '@%s Timeline' % mastodon_user.username,
            'updated_date_iso': updated_date.isoformat(),
            'feed_url': self.request.url,
            'display_statuses': display_statuses,
            'include_status_json': include_status_json,
        }

        if self.request.get('output') == 'html':
            self._write_template('mastofeeder/feed.html', params)
        else:
            self._write_template(
                'mastofeeder/feed.atom',
                params,
                # text/xml is pretty-printed and thus easier to see
                content_type='text/xml' if include_status_json
                    else 'application/atom+xml')

        self._add_last_modified_header(updated_date)

