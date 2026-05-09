import datetime
import logging

from google.appengine.api import taskqueue

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

class AdvanceCronHandler(base.handlers.BaseHandler):
    def get(self):
        self._write_error(410)
        return
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
            taskqueue.add(
                queue_name='feedplayback-advance',
                url='/tasks/feed-playback/advance',
                params={'subscription_id': subscription.id})

        logging.info('Advanced %d subscriptions' % len(subscriptions))
        self.response.out.write('OK')

class AdvanceTaskHandler(base.handlers.BaseHandler):
    def post(self):
        self._write_error(410)
        return
        subscription_id = self.request.get('subscription_id')
        subscription = data.get_subscription_by_id(subscription_id)
        subscription.advance()
        self.response.out.write('OK')

class PreviewHandler(base.handlers.BaseHandler):
    def get(self):
        self._write_error(410)
        return
        url = self.request.get('url').strip()
        if not url:
            self._write_input_error('Missing "url" parameter')
            return

        try:
            start_date = datetime.datetime.strptime(
                self.request.get('start-date'), '%Y-%m-%d')
        except ValueError:
            start_date = datetime.datetime(1970, 1, 1)

        self._write_json({
            'firstItem': data.get_start_item_contents(url, start_date).as_json_dict(),
        })

class CreateHandler(base.handlers.BaseHandler):
    def post(self):
        self._write_error(410)
        return
        url = self.request.get('url').strip()
        if not url:
            self._write_input_error('Missing "url" parameter')
            return

        try:
            start_date = datetime.datetime.strptime(
                self.request.get('start-date'), '%Y-%m-%d')
        except ValueError:
            start_date = datetime.datetime(1970, 1, 1)
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
            intro_title='Feed playback for "%s" has begun' % feed_title,
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
        self._write_error(410)
        return
        url = self.request.get('url').strip()
        if not url:
            self._write_input_error('Missing "url" parameter')
            return

        feed_info = data.get_feed_info(url)
        if feed_info:
            self._write_json(feed_info.as_json_dict())
        else:
            self._write_input_error('Invalid "url" parameter')

class SubscriptionHandler(base.handlers.BaseHandler):
    def get(self, subscription_id):
        self._write_error(410)
        return
        subscription = data.get_subscription_by_id(subscription_id)

        if not subscription:
            self._write_not_found()
            return

        feed_info = data.get_feed_info_from_feed_url(subscription.feed_url)

        self._write_template('feedplayback/subscription.html', {
            'feed_title': feed_info.title,
            'feed_url': subscription.feed_url,
            'subscription_id': subscription_id,
            'subscription_feed_url': subscription.get_subscription_feed_url(),
            'subscription_reader_url': subscription.get_subscription_reader_url(),
            'position': subscription.position + 1,
            'item_count': len(feed_info.item_ids),
            'frequency': _FREQUENCY_DISPLAY_NAMES[subscription.frequency]
        })

class SubscriptionAdvanceHandler(base.handlers.BaseHandler):
    def post(self):
        self._write_error(410)
        return
        subscription_id = self.request.get('subscription_id')
        subscription = data.get_subscription_by_id(subscription_id)
        subscription.advance()
        self.redirect('/feed-playback/subscription/%s' % subscription_id)
