import base64
import datetime
import logging
import time
import urllib
import urlparse
import uuid

from google.appengine.ext import db

from datasources import googlereader

class _FeedInfo(db.Model):
    title = db.StringProperty()
    item_ids = db.StringListProperty()
    item_timestamps_usec = db.ListProperty(long)

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
        return {}

    return get_feed_info_from_feed_url(feed_url)

def get_feed_info_from_feed_url(feed_url):
    feed_info = _FeedInfo.get_by_key_name(feed_url)
    
    if not feed_info:
        title = googlereader.lookup_feed_title(feed_url) or \
            urlparse.urlparse(feed_url).netloc
        item_refs = googlereader.get_feed_item_refs(feed_url)
        
        if not item_refs:
            return {}
        
        feed_info = _FeedInfo(
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

class _Subscription(db.Model):
    reader_stream_id = db.StringProperty()
    feed_url = db.StringProperty()
    frequency = db.StringProperty()
    # Remainder of days-since-epoch of subscription creation divided by update
    # frequency (i.e. modulo of 2 for every other day, modulo of 7 for weekly),
    # so that we can figure out for the daily cron job invocation which
    # subscriptions to advance.
    frequency_modulo = db.IntegerProperty()
    position = db.IntegerProperty()

class Subscription(object):
    def __init__(self, id, reader_stream_id, feed_url, frequency, frequency_modulo, position):
        self.id = id
        self.reader_stream_id = reader_stream_id
        self.feed_url = feed_url
        self.frequency = frequency
        self.frequency_modulo = frequency_modulo
        self.position = position
    
    def save(self):
        subscription = _Subscription(
            key_name=self.id,
            reader_stream_id=self.reader_stream_id,
            feed_url=self.feed_url,
            frequency=self.frequency,
            frequency_modulo=self.frequency_modulo,
            position=self.position)
        subscription.put()

    def create_reader_stream(self, intro_title, intro_body):
        googlereader.create_note(
            title=intro_title,
            body=intro_body,
            share=False,
            additional_stream_ids=[self.reader_stream_id])
        
    def get_subscription_feed_url(self):
        return 'http://www.google.com/reader/public/atom/%s' % urllib.quote(self.reader_stream_id)
    
    def get_subscription_reader_url(self):
        return 'http://www.google.com/reader/view/%s' % urllib.quote(self.reader_stream_id)
    
    def as_json_dict(self):
        return {
          'feedUrl': self.get_subscription_feed_url(),
          'readerUrl': self.get_subscription_reader_url(),
        }
        
def get_modulo_for_frequency(frequency):
    if frequency == '1d':
      return 0
    else:
        days_since_epoch = int(time.time()/3600 * 24)
        if frequency == '2d':
            return days_since_epoch % 2
        else:
            return days_since_epoch % 7

def get_subscription_by_id(id):
    subscription = _Subscription.get_by_key_name(id)
    
    if not subscription:
        return None
    
    return Subscription(
        id,
        subscription.reader_stream_id,
        subscription.feed_url,
        subscription.frequency,
        subscription.frequency_modulo,
        subscription.position)

def create_subscription(feed_url, start_date, frequency):
    feed_info = get_feed_info_from_feed_url(feed_url)
    
    start_timestamp_usec = time.mktime(start_date.utctimetuple()) * 1000000
    start_position = 0
    for item_timestamp_usec in feed_info.item_timestamps_usec:
        if item_timestamp_usec >= start_timestamp_usec:
            break
        start_position += 1

    feed_title = feed_info.title
    # Compact encoding of a UUID
    subscription_id = base64.urlsafe_b64encode(
        uuid.uuid4().bytes).replace('=', '')

    reader_tag_name = '%s ( Stream Spigot Feed Playback %s)' % (feed_title, subscription_id)
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
