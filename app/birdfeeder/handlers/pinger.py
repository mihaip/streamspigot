import logging

from google.appengine.api import taskqueue

import base.handlers
from birdfeeder import data
from pingersecret import SECRET

# We don't start updates right away, since the timeline REST API endpoint often
# won't return a status that the Streaming API just notified us about
# (replication delays on Twitter's end?).
# TODO(mihaip): pass in the expected status ID to the server, and have it keep
# trying to update until the timeline REST API returns it, instead of guessing
# at the propagation delay.
UPDATE_DELAY_SEC = 5

class FollowingHandler(base.handlers.BaseHandler):
    def get(self):
        if self.request.get('secret') != SECRET:
            self._write_input_error('Setec Astronomy')
            return

        self._write_json(data.FollowingData.get_following_list())

class PingHandler(base.handlers.BaseHandler):
    def post(self):
        if self.request.get('secret') != SECRET:
            self._write_input_error('Setec Astronomy')
            return

        update_twitter_id = int(self.request.get('update_twitter_id'))

        logging.info('Got ping for %d' % update_twitter_id)

        following_twitter_ids = data.FollowingData.get_following_twitter_ids(
            update_twitter_id)
        for following_twitter_id in following_twitter_ids:
            logging.info('Queueing update for %d' % following_twitter_id)
            session = data.Session.get_by_twitter_id(str(following_twitter_id))

            taskqueue.add(
                queue_name='birdfeeder-update',
                url='/tasks/bird-feeder/update',
                countdown=UPDATE_DELAY_SEC,
                params=session.as_dict())

        self.response.out.write(
            'Queued %d updates' % len(following_twitter_ids))
