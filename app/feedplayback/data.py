from datasources import googlereader

def get_feed_info(html_or_feed_url):
    feed_url = googlereader.lookup_feed_url(html_or_feed_url)
    
    if not feed_url:
        return {}
    
    feed_item_refs = googlereader.get_feed_item_refs(feed_url)
    item_count = len(feed_item_refs)
    oldest_item_timestamp_msec = -1
    if item_count:
      oldest_item_timestamp_msec = int(feed_item_refs[-1].timestamp_usec/1000)
    return {
        'feedUrl': feed_url,
        'itemCount': item_count,
        'oldestItemTimestampMsec': oldest_item_timestamp_msec,
    }

