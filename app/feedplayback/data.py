from google.appengine.ext import db

from datasources import googlereader

class _FeedInfo(db.Model):
    title = db.StringProperty()
    item_ids = db.StringListProperty()
    item_timestamps_usec = db.ListProperty(long)

def get_feed_info(html_or_feed_url):
    feed_url = googlereader.lookup_feed_url(html_or_feed_url)
    
    if not feed_url:
        return {}

    feed_info = _FeedInfo.get_by_key_name(feed_url)
    
    if not feed_info:
        title = googlereader.lookup_feed_title(feed_url)
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
    
    item_count = len(feed_info.item_ids)
    oldest_item_timestamp_msec = -1
    if item_count:
      oldest_item_timestamp_msec = int(feed_info.item_timestamps_usec[0]/1000)
    return {
        'feedUrl': feed_url,
        'feedTitle': feed_info.title,
        'itemCount': item_count,
        'oldestItemTimestampMsec': oldest_item_timestamp_msec,
    }

