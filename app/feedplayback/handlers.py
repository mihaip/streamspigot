import base64
import uuid

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
        
        feed_title = data.get_feed_info(url).title
        # Compact encoding of a UUID
        subscription_id = base64.urlsafe_b64encode(
            uuid.uuid4().bytes).replace('=', '')
        
        reader_tag_name = '%s (Stream Spigot Playback %s)' % (feed_title, subscription_id)
        reader_stream_id = 'user/123/label/%s' % reader_tag_name
        
        feed_url = 'http://www.google.com/reader/public/atom/%s' % reader_stream_id
        reader_url = 'http://www.google.com/reader/view/%s' % reader_stream_id
        
        self._write_json({
          'feedUrl': feed_url,
          'readerUrl': reader_url,
        });
        
class FeedInfoHandler(base.handlers.BaseHandler):
    def get(self):
        url = self.request.get('url').strip()
        if not url:
            self._write_input_error('Missing "url" parameter')
            return
    
        self._write_json(data.get_feed_info(url).as_json_dict())