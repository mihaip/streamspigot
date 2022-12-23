import datetime
import itertools
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
        if self.request.get('mode') == 'digest':
            self._get_digest()
        else:
            self._get_feed()

    def _get_feed(self):
        title_label, log_label = self._get_labels()
        logging.info('Serving feed for %s', log_label)

        # Include items from the past 12 hours, which should be enough to cover
        # most federation delays.
        limit_date = datetime.datetime.utcnow()  - datetime.timedelta(hours=12)
        max_id = None
        statuses = []
        while True:
            chunk_statuses = self._get_statuses(limit=40, max_id=max_id)
            chunk_statuses = [s for s in chunk_statuses if s.created_at.replace(tzinfo=None) >= limit_date]
            if not chunk_statuses:
                break
            statuses.extend(chunk_statuses)
            max_id = chunk_statuses[-1].id
        display_statuses = mastodondisplay.DisplayStatus.wrap(
            statuses, thumbnails.LARGE_THUMBNAIL, self._session.timezone())

        logging.info('  Feed has %d items', len(display_statuses))

        include_status_json = self.request.get('include_status_json') == 'true'

        updated_date = datetime.datetime.utcnow()

        params = {
            'feed_title': '%s Timeline' % title_label,
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

    def _get_digest(self):
        include_status_json = self.request.get('include_status_json') == 'true'
        dev_mode = self.request.get('dev') == 'true'

        end_date = None
        end_date_str = self.request.get('end_date')
        if end_date_str:
            try:
                end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%dT%H:%M:%S')
            except ValueError:
                pass
        if not end_date:
            end_date = datetime.datetime.utcnow().replace(
                hour=0, minute=0, second=0, microsecond=0)
        digest_length = datetime.timedelta(days=1)
        start_date = end_date - digest_length

        if not dev_mode and self._handle_not_modified(last_modified_date=end_date):
            return

        title_label, log_label = self._get_labels()
        logging.info('Serving digest for %s for the range %s to %s', log_label, start_date.isoformat(), end_date.isoformat())

        max_id = None
        statuses = []
        while True:
            chunk_statuses = self._get_statuses(limit=40, max_id=max_id)
            chunk_statuses = [s for s in chunk_statuses if s.created_at.replace(tzinfo=None) >= start_date]
            if not chunk_statuses:
                break
            statuses.extend([s for s in chunk_statuses if s.created_at.replace(tzinfo=None) < end_date])
            max_id = chunk_statuses[-1].id
        statuses = list(reversed(statuses))

        timezone = self._session.timezone()
        status_groups = []
        for _, group_statuses in itertools.groupby(
                statuses, lambda status: status.account.url):
            group_statuses = list(group_statuses)
            status_groups.append(mastodondisplay.DisplayStatusGroup(
                group_statuses[0].account,
                group_statuses,
                thumbnails.LARGE_THUMBNAIL,
                timezone))

        logging.info('  Digest has %d statuses, %d groups', len(statuses), len(status_groups))

        digest_contents = unicode(self._render_template('mastofeeder/digest-contents.snippet', {
            'reply_base_url': self._get_url('feed/%s/parent' % self._session.feed_id),
            'status_groups': status_groups,
            'include_status_json': include_status_json,
        }))

        params = {
            'feed_title': '%s Digest' % title_label,
            'end_date_iso': end_date.isoformat(),
            'title_date': '%s (UTC)' % start_date.strftime('%A, %B %d, %Y'),
            'feed_url': self.request.url,
            'html_url': self.request.url + '&output=html',
            'digest_html_url': self.request.url + '&output=html&end_date=' + end_date.isoformat(),
            'digest_contents': digest_contents,
        }

        if not dev_mode:
            self._add_caching_headers(
                last_modified_date=end_date,
                max_age_sec=digest_length.total_seconds())

        if self.request.get('output') == 'html':
            self._write_template('mastofeeder/digest.html', params)
        else:
            self._write_template(
                'mastofeeder/digest.atom',
                params,
                # text/xml is pretty-printed and thus easier to see
                content_type='text/xml' if include_status_json
                    else 'application/atom+xml')

    def _get_statuses(self, max_id=None, min_id=None, since_id=None, limit=None):
        raise NotImplementedError()

    def _get_labels(self):
        raise NotImplementedError()

class TimelineFeedHandler(BaseTimelineFeedHandler):
    def _get_statuses(self, max_id=None, min_id=None, since_id=None, limit=None):
        return self._api.timeline_home(
            max_id=max_id,
            min_id=min_id,
            since_id=since_id,
            limit=limit,
        )

    def _get_labels(self):
        mastodon_user = self._api.me()
        return '@%s' % mastodon_user.username, 'user %s' % self._session.mastodon_id

class ListTimelineFeedHandler(BaseTimelineFeedHandler):
    def _get_statuses(self, max_id=None, min_id=None, since_id=None, limit=None):
        return self._api.timeline_list(
            id=self._get_list_id(),
            max_id=max_id,
            min_id=min_id,
            since_id=since_id,
            limit=limit,
        )

    def _get_labels(self):
        list_id = self._get_list_id()
        list = self._api.list(list_id)
        return '%s' % list.title, 'user %s list %s' % (self._session.mastodon_id, list_id)

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
