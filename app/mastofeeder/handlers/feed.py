import datetime
import logging

from mastofeeder import data
from datasources import mastodondisplay, thumbnails
import session

# Overrides the session accessors from SessionHandler to key the session
# on the feed ID in the URL, instead of the SID cookie.
class FeedHandler(session.SessionApiHandler):
    def _get_feed_id(self):
        return self.request.route_args[0]

    def _has_request_session(self):
        return self._get_feed_id()

    def _get_session_from_request(self):
        return data.Session.get_by_feed_id(self._get_feed_id())

    def _get_signed_out(self):
        self._write_error(403)

class BaseTimelineFeedHandler(FeedHandler):
    def _get_signed_in(self):
        statuses = self._get_statuses()
        display_statuses = mastodondisplay.DisplayStatus.wrap(
            statuses, thumbnails.LARGE_THUMBNAIL, self._session.timezone())

        logging.info('  Feed has %d items', len(display_statuses))

        include_status_json = self.request.get('include_status_json') == 'true'

        # TODO: if-modified-since support
        updated_date = datetime.datetime.utcnow()

        params = {
            'feed_title': self._get_title(),
            'updated_date_iso': updated_date.isoformat(),
            'feed_url': self.request.url,
            'reply_base_url': self._get_url('feed/%s/parent' % self._session.feed_id),
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

    def _get_statuses(self):
        raise NotImplementedError()

    def _get_title(self):
        raise NotImplementedError()

class TimelineFeedHandler(BaseTimelineFeedHandler):
    def _get_statuses(self):
        mastodon_id = self._session.mastodon_id
        logging.info('Serving timeline feed for %s', mastodon_id)
        return self._api.timeline_home(limit=40)

    def _get_title(self):
        mastodon_user = self._api.me()
        return '@%s Timeline' % mastodon_user.username

class ListTimelineFeedHandler(BaseTimelineFeedHandler):
    def _get_statuses(self):
        list_id = self._get_list_id()
        logging.info('Serving timeline feed for user %s list %s', self._session.mastodon_id, list_id)
        return self._api.timeline_list(id=list_id, limit=40)

    def _get_title(self):
        list = self._api.list(self._get_list_id())
        return '%s Timeline' % list.title

    def _get_list_id(self):
        return int(self.request.route_args[1])

# Redirect to the parent of a status. Done as a separate handler so that we
# don't need to do the "context" API call for every status in the feed.
class FeedStatusParentHandler(FeedHandler):
    def _get_signed_in(self):
        status_id = self.request.route_args[1]
        context = self._api.status_context(status_id)
        if not context:
            self._write_not_found()
            return
        if not context.ancestors:
            self._write_not_found()
            return
        self.redirect(context.ancestors[-1].url)
