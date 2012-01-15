import logging
import time
import urllib
import urllib2

from google.appengine.api import taskqueue
from google.appengine.ext import db

from base.constants import CONSTANTS
import base.handlers
from birdfeeder import data
import birdfeeder.handlers.feed

RECENT_STATUS_INTERVAL_SEC = 10 * 60

HUB_URL_BATCH_SIZE = 100

# When we get a ping, we don't start updates right away, since the timeline REST
# API endpoint often won't return a status that the Streaming API just notified
# us about (replication delays on Twitter's end?).
PING_UPDATE_DELAY_SEC = 2

# If we still don't see the expected status ID, then we try again a few times
# (delaying retries by retry count * update delay)
PING_UPDATE_RETRY_MAX = 5

class UpdateCronHandler(base.handlers.BaseHandler):
    def get(self):
        update_task_count = 0
        for session in data.Session.all():
            update_task_count += 1
            session.enqueue_update_task()

        self.response.out.write('Started %d updates' % update_task_count)

class UpdateTaskHandler(base.handlers.BaseHandler):
    def post(self):
        session = data.Session.from_request(self.request)
        had_updates, status_ids = update_timeline(session)

        if had_updates:
            # TODO(mihaip): share feed URL generation with main.py
            feed_url = '%s/bird-feeder/feed/timeline/%s' % (
                CONSTANTS.APP_URL, session.feed_id)
            ping_hub([feed_url])
        self.response.out.write(
            'Updated %s, %s updates' %
                (session.twitter_id, had_updates and 'had' or 'didn\'t have'))

        # If this update was triggered in response to a ping, see if we actually
        # got the status that we were looking for, otherwise we have to try
        # again.
        try:
            expected_status_id = int(self.request.get('expected_status_id'))
            update_retry_count = int(self.request.get('update_retry_count'))

            logging.info('Looking for expected status %d...' % expected_status_id)

            if expected_status_id in status_ids:
                logging.info('...found')
                return

            if update_retry_count == PING_UPDATE_RETRY_MAX:
                logging.info('...not found, and no retries left')
                return

            update_retry_count += 1

            logging.info('...not found, queuing the %d-th retry' %
                update_retry_count)

            session.enqueue_update_task(
                countdown=update_retry_count * PING_UPDATE_DELAY_SEC,
                expected_status_id=expected_status_id,
                update_retry_count=update_retry_count)
        except ValueError:
            # Ignore mising/invalid values
            return


# Helper handler (for development) that updates a single user's timeline and
# refreshes their feed within a single request.
class UpdateFeedToolHandler(base.handlers.BaseHandler):
    def get(self):
        session = data.Session.get_by_twitter_id(self.request.get('twitter_id'))

        update_timeline(session)

        # We render the feed handler inline instead of redirecting to it, so
        # that a browser reload will allow this handler (which also updates)
        # to be triggered
        feed_handler = birdfeeder.handlers.feed.TimelineFeedHandler()
        feed_handler._session = session
        feed_handler._api = session.create_api()
        feed_handler.initialize(self.request, self.response)
        feed_handler._get_signed_in()

def update_timeline(session):
    logging.info('Updating %s' % session.twitter_id)

    stream = data.StreamData.get_or_create_timeline_for_user(session.twitter_id)

    # For the sake of efficiency, only get tweets since the most recently
    # received one. However, Twitter has had out-of-order delivery issues in the
    # past, so if the most recent status is recent (~10 minutes), pick the
    # oldest one that falls outside that window.
    since_id = None
    if stream.status_ids:
        threshold_time = time.time() - RECENT_STATUS_INTERVAL_SEC
        for i in xrange(0, len(stream.status_ids)):
          since_id = stream.status_ids[i]
          if stream.status_timestamps_sec[i] < threshold_time:
              break

    api = session.create_api()
    # TODO(mihaip): Support paging back if more than 200 statuses were received
    # since the last update.
    timeline = api.GetFriendsTimeline(
        count=200,
        retweets=True,
        include_entities=True,
        since_id=since_id)

    known_status_ids = set(stream.status_ids)
    new_status_ids = []
    new_status_timestamps_sec = []
    new_statueses_by_id = {}

    for status in timeline:
        if status.id in known_status_ids:
            continue
        new_status_ids.append(status.id)
        new_status_timestamps_sec.append(status.created_at_in_seconds)
        new_statueses_by_id[status.id] = status

    if not new_status_ids:
        logging.info('  No new status IDs')
        return False, stream.status_ids

    logging.info('  %d new status IDs for this stream' % len(new_status_ids))

    stream.status_ids = new_status_ids + stream.status_ids
    stream.status_timestamps_sec = \
        new_status_timestamps_sec + stream.status_timestamps_sec

    unknown_status_ids = data.StatusData.get_unknown_status_ids(new_status_ids)

    if not unknown_status_ids:
        logging.info('  No new statuses')
        stream.put()
        # Even though there were no new statuses to store, the timeline still
        # had new tweets, so we want the hub to be pinged.
        return True, stream.status_ids
    logging.info('  %d new statuses' % len(unknown_status_ids))

    unknown_statuses = [
        data.StatusData.from_status(new_statueses_by_id[id])
        for id in unknown_status_ids
    ]
    db.put(unknown_statuses)

    # We only put the stream data now, so that if the status put above failed,
    # we will still attempt to recreate the items on the next fetch.
    stream.put()

    return True, stream.status_ids

def ping_hub(urls):
    for i in xrange(0, len(urls), HUB_URL_BATCH_SIZE):
      chunk = urls[i:i + HUB_URL_BATCH_SIZE]
      logging.info('Pinging %s for %d URLs...' % (CONSTANTS.HUB_URL, len(chunk)))

      data = urllib.urlencode({
              'hub.url': chunk,
              'hub.mode': 'publish'
          },
          doseq=True)

      try:
          response = urllib2.urlopen(CONSTANTS.HUB_URL, data)
      except (IOError, urllib2.HTTPError), e:
          if hasattr(e, 'code') and e.code == 204:
              logging.info('...Success')
              continue
          error = ''
          if hasattr(e, 'read'):
              error = e.read()
          logging.warning('Error from hub: %s, Response: "%s"' % (e, error))
      logging.info('No 204 response')

