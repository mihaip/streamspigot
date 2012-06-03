import calendar
import datetime
import logging
import time

from birdfeeder import data
from datasources import thumbnails, twitterdisplay
import session

FEED_STATUS_INTERVAL_SEC = 24 * 60 * 60 # One day
IF_MODIFIED_SINCE_INTERVAL_SEC = 60 * 60 # One hour
MIN_FEED_ITEMS = 10

# Overrides the session accessors from SessionHandler to key the session
# on the feed ID in the URL, instead of the SID cookie.
class FeedHandler(session.SessionApiHandler):
    def _get_feed_id(self):
        path = self.request.path.split('/')
        return path[-1]

    def _has_request_session(self):
        return self._get_feed_id()

    def _get_session_from_request(self):
        return data.Session.get_by_feed_id(self._get_feed_id())

    def _get_signed_out(self):
        self._write_error(403)

class TimelineFeedHandler(FeedHandler):
    def _get_signed_in(self):
        twitter_id = self._session.twitter_id
        logging.info('Serving feed for %s' % twitter_id)
        user = self._api.GetUser(twitter_id)

        stream = data.StreamData.get_timeline_for_user(twitter_id)

        threshold_time = time.time() - FEED_STATUS_INTERVAL_SEC

        # It's wasteful to serve the hub the full set of items in the feed, so
        # we use a variant of the feed windowing technique described at
        # http://code.google.com/p/pubsubhubbub/wiki/PublisherEfficiency#Feed_windowing
        # to only give it new items. We treat the If-Modified-Since header as
        # an indication of the items that the hub already has, but we allow one
        # hour of overlap, in case of items getting dropped, replication delay,
        # cosmic rays, etc.
        if self._user_agent_contains('appid: pubsubhubbub'):
            if_modified_since = self._get_if_modified_since()
            if if_modified_since:
                logging.info('If-Modified-Since: %d' % if_modified_since)
                threshold_time = if_modified_since - IF_MODIFIED_SINCE_INTERVAL_SEC
                # Since we're serving a partial response, we don't want proxies
                # caching it.
                self.response.headers['Cache-Control'] = 'private'

        # We want the feed to have all tweets from the past day, but also at
        # at least 10 items.
        feed_status_ids = []
        if stream:
            for status_id, status_timestamp_sec in stream.status_pairs():
                if status_timestamp_sec < threshold_time and \
                        len(feed_status_ids) >= MIN_FEED_ITEMS:
                    break
                feed_status_ids.append(status_id)

        logging.info('  Feed has %d items' % len(feed_status_ids))

        status_data = data.StatusData.get_by_status_ids(feed_status_ids)
        statuses = [s.to_status() for s in status_data]

        timezone = twitterdisplay.get_timezone_for_user(user)

        # We don't actually want statuses grouped, instead we want one status
        # per item.
        status_groups = [
            twitterdisplay.DisplayStatusGroup(
                user=status.user,
                statuses=[status],
                thumbnail_size=thumbnails.LARGE_THUMBNAIL,
                timezone=timezone)
            for status in statuses
        ]

        updated_date = datetime.datetime.utcnow()

        self._write_template('birdfeeder/feed.atom', {
              'feed_title': '@%s Twitter Timeline' % user.screen_name,
              'updated_date_iso': updated_date.isoformat(),
              'feed_url': self.request.url,
              'status_groups': status_groups,
            },
            content_type='application/atom+xml')

        self._add_last_modified_header(updated_date)
