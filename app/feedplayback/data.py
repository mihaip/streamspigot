from datasources import googlereader

def get_feed_info(html_or_feed_url):
    feed_url = googlereader.lookup_feed_url(html_or_feed_url)
    
    if not feed_url:
        return {}
    return {'feedUrl': feed_url}