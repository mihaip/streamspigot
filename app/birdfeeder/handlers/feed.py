import datetime

import birdfeeder.data as data
import datasources.twitterdisplay
import session

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
        user = self._api.GetUser(self._session.twitter_id)
        statuses = self._api.GetFriendsTimeline(
            count=50, retweets=True, include_entities=True)
        # We don't actually want statuses grouped, instead we want one status
        # per item.
        status_groups = [
            datasources.twitterdisplay.StatusGroup(
                user=status.user, statuses=[status])
            for status in statuses
        ]

        self._write_template('birdfeeder/feed.atom', {
              'feed_title': '@%s Twitter Timeline' % user.screen_name,
              'updated_date_iso': datetime.datetime.utcnow().isoformat(),
              'feed_url': self.request.url,
              'status_groups': status_groups,
            },
            content_type='application/atom+xml')
