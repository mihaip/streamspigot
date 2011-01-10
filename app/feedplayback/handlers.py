import base.handlers
import data

class MainHandler(base.handlers.BaseHandler):
    def get(self):
        self._write_template('feedplayback/index.html')

class CreateHandler(base.handlers.BaseHandler):
    def post(self):
        url = self.request.get('url')
        start_date = self.request.get('start-date')
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