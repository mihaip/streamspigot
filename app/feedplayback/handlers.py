import datetime
import logging

from base.constants import CONSTANTS
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

class AdvanceHandler(base.handlers.BaseHandler):
    def get(self):
        frequency = self.request.get('frequency')
        frequency_modulo = int(self.request.get('frequency_modulo'))
        
        current_modulo = data.get_modulo_for_frequency(frequency)
        if current_modulo != frequency_modulo:
            logging.info('Not advancing for modulo %d today '
                '(which is modulo %d)' % (frequency_modulo, current_modulo))
            return
        
        subscriptions = data.get_subscriptions_with_frequency_and_modulo(
            frequency, frequency_modulo)
        
        for subscription in subscriptions:
            subscription.advance()
        
        logging.info('Advanced %d subscriptions' % len(subscriptions))
        self.response.out.write('OK')

class CreateHandler(base.handlers.BaseHandler):
    def post(self):
        url = self.request.get('url')
        start_date = datetime.datetime.strptime(
            self.request.get('start-date'), '%Y-%m-%d')
        frequency = self.request.get('frequency')
        
        subscription = data.create_subscription(
            url,
            start_date,
            frequency)
            
        feed_info = data.get_feed_info_from_feed_url(url)
        feed_title = feed_info.title
        subscription_html_url = '%s/feed-playback/subscription/%s' % (
            CONSTANTS.APP_URL, subscription.id)

        subscription.create_reader_stream(
            intro_html_url=subscription_html_url,
            intro_title='Feed playback for "%s"' % feed_title,
            intro_body=self._render_template(
                'feedplayback/intro-body.snippet', {
                  'subscription_html_url': subscription_html_url,
                  'feed_url': url,
                  'feed_title': feed_title,
                  'item_count': len(feed_info.item_ids) - subscription.position,
                  'frequency': _FREQUENCY_DISPLAY_NAMES[frequency],
                }))
        
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
            'frequency': _FREQUENCY_DISPLAY_NAMES[subscription.frequency]
        })
