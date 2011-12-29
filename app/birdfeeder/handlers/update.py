import logging
import time
import urllib
import urllib2

from google.appengine.ext import db

from base.constants import CONSTANTS
import base.handlers
from birdfeeder import data

RECENT_STATUS_INTERVAL_SEC = 10 * 60

HUB_URL_BATCH_SIZE = 100

class UpdateCronHandler(base.handlers.BaseHandler):
    def get(self):
        ping_feed_urls = []
        for session in data.Session.all():
            had_updates = update_timeline(session)
            if had_updates:
                # TODO(mihaip): share feed URL generation with main.py
                feed_url = '%s/bird-feeder/feed/timeline/%s' % (
                    CONSTANTS.APP_URL, session.feed_id)
                ping_feed_urls.append(feed_url)

        logging.info('%d feeds need update' % len(ping_feed_urls))

        ping_hub(ping_feed_urls)

        self.response.out.write('OK')

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
        return False

    logging.info('  %d new status IDs for this stream' % len(new_status_ids))

    stream.status_ids = new_status_ids + stream.status_ids
    stream.status_timestamps_sec = \
        new_status_timestamps_sec + stream.status_timestamps_sec

    unknown_status_ids = data.StatusData.get_unknown_status_ids(new_status_ids)

    if not unknown_status_ids:
        logging.info('  No new statuses')
        # Even though there were no new statuses to store, the timeline still
        # had new tweets, so we want the hub to be pinged.
        return True
    logging.info('  %d new statuses' % len(unknown_status_ids))

    unknown_statuses = [
        data.StatusData.from_status(new_statueses_by_id[id])
        for id in unknown_status_ids
    ]
    db.put(unknown_statuses)

    # We only put the stream data now, so that if the status put above failed,
    # we will still attempt to recreate the items on the next fetch.
    stream.put()

    return True

def ping_hub(urls):
    for i in xrange(0, len(urls), HUB_URL_BATCH_SIZE):
      chunk = urls[i:i + HUB_URL_BATCH_SIZE]
      logging.info(chunk)
      logging.info('Pinging %s for %d URLs' % (CONSTANTS.HUB_URL, len(chunk)))

      data = urllib.urlencode({
              'hub.url': chunk,
              'hub.mode': 'publish'
          },
          doseq=True)
      try:
          response = urllib2.urlopen(CONSTANTS.HUB_URL, data)
      except (IOError, urllib2.HTTPError), e:
          if hasattr(e, 'code') and e.code == 204:
              continue
          error = ''
          if hasattr(e, 'read'):
              error = e.read()
          logging.warning('Error from hub: %s, Response: "%s"' % (e, error))

