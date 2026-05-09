import logging
import time
import urllib
import urlparse

from google.appengine.ext import db

from base.constants import CONSTANTS
import base.util
from datasources import googlereader

class FeedInfoData(db.Model):
    title = db.StringProperty(indexed=False)
    item_ids = db.StringListProperty(indexed=False)
    item_timestamps_usec = db.ListProperty(long, indexed=False)

    @classmethod
    def kind(cls):
        return 'feedplayback.FeedInfoData'

class FeedInfo(object):
    def __init__(self, feed_url, title, item_ids, item_timestamps_usec):
        self.feed_url = feed_url
        self.title = title
        self.item_ids = item_ids
        self.item_timestamps_usec = item_timestamps_usec

    def as_json_dict(self):
        item_count = len(self.item_ids)
        oldest_item_timestamp_msec = -1
        if item_count:
          oldest_item_timestamp_msec = int(self.item_timestamps_usec[0]/1000)
        return {
            'feedUrl': self.feed_url,
            'feedTitle': self.title,
            'itemCount': item_count,
            'oldestItemTimestampMsec': oldest_item_timestamp_msec,
        }

def get_feed_info(html_or_feed_url):
    feed_url = googlereader.lookup_feed_url(html_or_feed_url)

    if not feed_url:
        return None

    return get_feed_info_from_feed_url(feed_url)

def get_feed_info_from_feed_url(feed_url):
    feed_info = FeedInfoData.get_by_key_name(feed_url)

    if not feed_info:
        title = googlereader.lookup_feed_title(feed_url) or \
            urlparse.urlparse(feed_url).netloc
        item_refs = googlereader.get_feed_item_refs(feed_url)

        if not item_refs:
            return {}

        feed_info = FeedInfoData(
            key_name=feed_url,
            title=title,
            item_ids=[i.id for i in item_refs],
            item_timestamps_usec=[i.timestamp_usec for i in item_refs],
        )
        feed_info.put()

    return FeedInfo(
        feed_url=feed_url,
        title=feed_info.title,
        item_ids=feed_info.item_ids,
        item_timestamps_usec=feed_info.item_timestamps_usec)

class SubscriptionData(db.Model):
    reader_stream_id = db.StringProperty(indexed=False)
    feed_url = db.StringProperty(indexed=False)
    frequency = db.StringProperty()
    # Remainder of days-since-epoch of subscription creation divided by update
    # frequency (i.e. modulo of 2 for every other day, modulo of 7 for weekly),
    # so that we can figure out for the daily cron job invocation which
    # subscriptions to advance.
    frequency_modulo = db.IntegerProperty()
    position = db.IntegerProperty(indexed=False)

    @classmethod
    def kind(cls):
        return 'feedplayback.SubscriptionData'

class Subscription(object):
    def __init__(self, id, reader_stream_id, feed_url, frequency, frequency_modulo, position):
        self.id = id
        self.reader_stream_id = reader_stream_id
        self.feed_url = feed_url
        self.frequency = frequency
        self.frequency_modulo = frequency_modulo
        self.position = position

    @staticmethod
    def from_datastore(subscription):
        return Subscription(
            subscription.key().name(),
            subscription.reader_stream_id,
            subscription.feed_url,
            subscription.frequency,
            subscription.frequency_modulo,
            subscription.position)

    def save(self):
        subscription = SubscriptionData(
            key_name=self.id,
            reader_stream_id=self.reader_stream_id,
            feed_url=self.feed_url,
            frequency=self.frequency,
            frequency_modulo=self.frequency_modulo,
            position=self.position)
        subscription.put()

    def create_reader_stream(self, intro_html_url, intro_title, intro_body):
        googlereader.set_stream_public(self.reader_stream_id, is_public=True)
        self.advance()
        googlereader.create_note(
            title=intro_title,
            body=intro_body,
            url=intro_html_url,
            source_url=CONSTANTS.APP_URL,
            source_title=CONSTANTS.APP_NAME,
            share=False,
            additional_stream_ids=[self.reader_stream_id])

    def advance(self):
        feed_info = get_feed_info_from_feed_url(self.feed_url)

        if self.position == len(feed_info.item_ids):
            # TODO(mihaip): insert some kind of "you're done" notification into
            # the stream?
            return

        item_id = feed_info.item_ids[self.position]

        # This API seems to fail most often (about one occurrence a day), so
        # it's worth retrying inline.
        retry_count = 0
        while True:
          try:
            googlereader.edit_item_tags(
                item_id,
                origin_stream_id='feed/%s' % self.feed_url,
                add_tags=[self.reader_stream_id])
            break
          except:
            retry_count += 1
            if retry_count == 5:
              logging.error('Could not advance subscription ID %s, '
                  'too many Google Reader API failures' % self.id)
              return

        self.position += 1
        self.save()

    def get_subscription_feed_url(self):
        return 'http://www.google.com/reader/public/atom/%s' % urllib.quote(self.reader_stream_id.encode('utf-8'))

    def get_subscription_reader_url(self):
        return 'http://www.google.com/reader/view/%s' % urllib.quote(self.reader_stream_id.encode('utf-8'))

    def as_json_dict(self):
        return {
          'feedUrl': self.get_subscription_feed_url(),
          'readerUrl': self.get_subscription_reader_url(),
        }

def get_modulo_for_frequency(frequency):
    if frequency == '1d':
      return 0
    else:
        days_since_epoch = int(time.time()/(3600 * 24))
        if frequency == '2d':
            return days_since_epoch % 2
        else:
            return days_since_epoch % 7

def get_subscription_by_id(id):
    subscription = SubscriptionData.get_by_key_name(id)

    if not subscription:
        return None

    return Subscription.from_datastore(subscription)

def get_subscriptions_with_frequency_and_modulo(frequency, frequency_modulo):
    query = SubscriptionData.all()
    query.filter('frequency =', frequency)
    query.filter('frequency_modulo =', frequency_modulo)

    subscriptions = []
    for result in query:
        subscriptions.append(Subscription.from_datastore(result))
    return subscriptions

def _get_nearest_item_index(feed_info, date):
    timestamp_usec = time.mktime(date.utctimetuple()) * 1000000
    index = 0
    for item_timestamp_usec in feed_info.item_timestamps_usec:
        if item_timestamp_usec >= timestamp_usec:
            break
        index += 1
    return min(index, len(feed_info.item_timestamps_usec) - 1)

def get_start_item_contents(feed_url, start_date):
    feed_info = get_feed_info_from_feed_url(feed_url)
    item_index = _get_nearest_item_index(feed_info, start_date)
    item_id = feed_info.item_ids[item_index]
    return googlereader.get_item_contents(item_id)

def create_subscription(feed_url, start_date, frequency):
    feed_info = get_feed_info_from_feed_url(feed_url)

    start_position = _get_nearest_item_index(feed_info, start_date)

    feed_title = feed_info.title[0:100]
    subscription_id = base.util.generate_id('s')

    reader_tag_name = googlereader.sanitize_tag_name(
        '%s (%s)' % (feed_title, subscription_id))
    reader_stream_id = 'user/%s/label/%s' % (
        googlereader.FEED_PLAYBACK_USER_ID, reader_tag_name)

    subscription = Subscription(
        subscription_id,
        reader_stream_id,
        feed_url,
        frequency,
        get_modulo_for_frequency(frequency),
        start_position)

    subscription.save()

    return subscription
