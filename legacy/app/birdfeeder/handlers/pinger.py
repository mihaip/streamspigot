import logging


import base.handlers
from birdfeeder import data
import birdfeeder.handlers.update
from pingersecret import SECRET

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

        update_twitter_id = long(self.request.get('update_twitter_id'))
        update_status_id = long(self.request.get('update_status_id'))

        logging.info('Got ping for status %d by %d' % (
            update_status_id, update_twitter_id))

        following_twitter_ids = data.FollowingData.get_following_twitter_ids(
            update_twitter_id)
        task_count = 0
        for following_twitter_id in following_twitter_ids:
            logging.info('Queueing update for %d' % following_twitter_id)
            session = data.Session.get_by_twitter_id(str(following_twitter_id))

            if session:
                session.enqueue_update_task(
                    countdown=birdfeeder.handlers.update.PING_UPDATE_DELAY_SEC,
                    expected_status_id=update_status_id,
                    update_retry_count=0)
                task_count += 1
            else:
                logging.info('Ignored ping due to missing session');

        self.response.out.write('Queued %d updates' % task_count)
