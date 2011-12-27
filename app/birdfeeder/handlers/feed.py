import birdfeeder.data as data
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
        statuses = self._api.GetFriendsTimeline(
            count=10, retweets=True, include_entities=True)
        self._write_template('birdfeeder/feed.atom', {
              'statuses': statuses,
            },
            content_type='text/xml')

