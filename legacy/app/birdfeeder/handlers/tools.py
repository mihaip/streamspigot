import base.handlers
from birdfeeder import data
import birdfeeder.handlers.feed
import birdfeeder.handlers.update

# Helper handler (for development) that updates a single user's timeline and
# refreshes their feed within a single request.
class UpdateFeedHandler(base.handlers.BaseHandler):
    def get(self):
        session = data.Session.get_by_twitter_id(self.request.get('twitter_id'))

        birdfeeder.handlers.update.update_timeline(session)

        # We render the feed handler inline instead of redirecting to it, so
        # that a browser reload will allow this handler (which also updates)
        # to be triggered
        feed_handler = birdfeeder.handlers.feed.TimelineFeedHandler()
        feed_handler._session = session
        feed_handler._api = session.create_api()
        feed_handler.initialize(self.request, self.response)
        feed_handler._get_signed_in()

class StatusHandler(base.handlers.BaseHandler):
    def get(self, status_id):
        statuses = data.StatusData.get_by_status_ids([status_id])
        if not statuses:
            self._write_not_found()
            return

        status = statuses[0]
        self._write_json(status.original_json_dict, pretty_print=True)
