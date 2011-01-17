import datetime

import base.handlers
import data

_FREQUENCY_DISPLAY_NAMES = {
    '1d': 'every day',
    '2d': 'every other day',
    '7d': 'every week',
}

class MainHandler(base.handlers.BaseHandler):
    def get(self):
        self._write_template('feedplayback/index.html')

class CreateHandler(base.handlers.BaseHandler):
    def post(self):
        url = self.request.get('url')
        start_date = datetime.datetime.strptime(
            self.request.get('start-date'), '%Y-%m-%d')
        frequency = self.request.get('frequency')
        
        subscription = data.create_subscription(url, start_date, frequency)
        
        self._write_json(subscription.as_json_dict())

        
class FeedInfoHandler(base.handlers.BaseHandler):
    def get(self):
        url = self.request.get('url').strip()
        if not url:
            self._write_input_error('Missing "url" parameter')
            return
    
        self._write_json(data.get_feed_info(url).as_json_dict())
        

class SubscriptionHandler(base.handlers.BaseHandler):
    def get(self, subscription_id):
        subscription = data.get_subscription_by_id(subscription_id)
        
        if not subscription:
            self._write_not_found()
            return
            
        feed_info = data.get_feed_info_from_feed_url(subscription.feed_url)

        self._write_template('feedplayback/subscription.html', {
            'feed_title': feed_info.title,
            'feed_url': subscription.feed_url,
            'subscription_feed_url': subscription.get_subscription_feed_url(),
            'subscription_reader_url': subscription.get_subscription_reader_url(),
            'position': subscription.position + 1,
            'item_count': len(feed_info.item_ids),
            'frequency': _FREQUENCY_DISPLAY_NAMES[subscription.frequency],
        })
