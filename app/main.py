import logging
import os

from google.appengine.ext import webapp
from google.appengine.ext.webapp import template
from google.appengine.ext.webapp import util

import twitterdigest

APP_NAME = 'Stream Spigot'

class BaseHandler(webapp.RequestHandler):
    GLOBAL_TEMPLATE_VALUES = {
        'BACKGROUND_COLOR': '#8aa7ff',
        'BACKGROUND_DARKER_COLOR': '#7094ff',
        'ANCHOR_COLOR': '#2db300',
        
        'USER_LINK_COLOR': '#333',
        'BUBBLE_COLOR': '#f6f6f6',
        'BUBBLE_REPLY_COLOR': '#e6e6e6',
        'BUBBLE_TEXT_COLOR': '#41419b',
        'BUBBLE_SEPARATOR_COLOR': '#d6E0ff',
        'HEADER_COLOR': '#666',
        
        'APP_NAME': APP_NAME
    }
    
    def _render_template(self, template_file_name, template_values={}):
        template_path = os.path.join(
            os.path.dirname(__file__), 'templates', template_file_name)
        template_values.update(BaseHandler.GLOBAL_TEMPLATE_VALUES)
        return template.render(template_path, template_values)

    def _write_template(self, template_file_name, template_values={}):
        self.response.out.write(
            self._render_template(template_file_name, template_values))
        

class MainHandler(BaseHandler):
    def get(self):
        self._write_template('index.html')

class TwitterDigestHandler(BaseHandler):
    def get(self):
        # Extract parameters
        usernames = self.request.get('usernames').split(' ')
        usernames = [u.strip().lower() for u in usernames if u.strip()]
        output = self.request.get('output') == 'html' and 'html' or 'atom'
        
        # Generate digest
        (grouped_statuses, start_date, error_usernames) = \
            twitterdigest.get_digest(usernames)

        # Template parameters
        homepage_url = 'http://' + os.environ.get('SERVER_NAME', '')
        base_digest_url = homepage_url + '/twitter/digest?usernames=' + '+'.join(usernames)

        self._write_template('twitter-digest.html', {
            'usernames': self._render_template(
                'usernames.snippet', {'usernames': usernames}),
            'error_usernames': error_usernames and self._render_template(
                'usernames.snippet', {'usernames': error_usernames}) or '',
            'grouped_statuses': grouped_statuses, 
            
            'title': '%s: Twitter Digest for %s (GMT)' % (
                APP_NAME, start_date.strftime('%A, %B %d, %Y')),
            'homepage_url': homepage_url,
            'feed_url': base_digest_url + '&output=html',
            'html_url': base_digest_url + '&output=atom',
            
            'digest_contents': self._render_template(
                'twitter-digest-contents.snippet',
                {'grouped_statuses': grouped_statuses}),
        })


def main():
    application = webapp.WSGIApplication([
            ('/twitter/digest', TwitterDigestHandler),
            ('/', MainHandler),
        ],
        debug=True)
    util.run_wsgi_app(application)


if __name__ == '__main__':
    main()
