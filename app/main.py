import logging
import os

from google.appengine.ext import webapp
from google.appengine.ext.webapp import template
from google.appengine.ext.webapp import util as webapp_util

import twitterdigest
import util

CONSTANTS = {
    'BACKGROUND_COLOR': '#8aa7ff',
    'BACKGROUND_DARKER_COLOR': '#7094ff',
    'ANCHOR_COLOR': '#2db300',
    
    'USER_LINK_COLOR': '#333',
    'BUBBLE_COLOR': '#f6f6f6',
    'BUBBLE_REPLY_COLOR': '#e6e6e6',
    'BUBBLE_TEXT_COLOR': '#41419b',
    'BUBBLE_SEPARATOR_COLOR': '#d6E0ff',
    'HEADER_COLOR': '#666',
    
    'APP_NAME': 'Stream Spigot',
}
    
class BaseHandler(webapp.RequestHandler):
    def _render_template(self, template_file_name, template_values={}):
        template_path = os.path.join(
            os.path.dirname(__file__), 'templates', template_file_name)
        template_values.update(CONSTANTS)
        return template.render(template_path, template_values)

    def _write_template(self, template_file_name, template_values={}):
        self.response.out.write(
            self._render_template(template_file_name, template_values))

class LinkFormatter(object):
    def get_attributes(self):
        return 'style="color:%s"' % CONSTANTS['ANCHOR_COLOR']
LINK_FORMATTER = LinkFormatter()

class MainHandler(BaseHandler):
    def get(self):
        self._write_template('index.html')

class TwitterDigestHandler(BaseHandler):
    class OutputTemplate(object):
        def __init__(self, template_file, content_type, use_relative_dates):
            self.template_file = template_file
            self.content_type = content_type
            self.use_relative_dates = use_relative_dates
    OUTPUT_TEMPLATES = {
        'html': OutputTemplate(
            'twitter-digest.html', 'text/html', True),
        'atom': OutputTemplate(
            'twitter-digest.atom', 'text/xml', False),
    }
    def get(self):
        # Extract parameters
        usernames = self.request.get('usernames').split(' ')
        usernames = [u.strip().lower() for u in usernames if u.strip()]
        output_template = TwitterDigestHandler.OUTPUT_TEMPLATES.get(
            self.request.get('output'),
            TwitterDigestHandler.OUTPUT_TEMPLATES['html'])
        
        # Generate digest
        (grouped_statuses, start_date, error_usernames) = \
            twitterdigest.get_digest(usernames, LINK_FORMATTER)

        # Template parameters
        homepage_url = 'http://' + os.environ.get('SERVER_NAME', '')
        base_digest_url = homepage_url + '/twitter/digest?usernames=' + \
            '+'.join(usernames)
        digest_id = '+'.join(usernames)
        digest_entry_id = digest_id + '-' + start_date.date().isoformat()

        self.response.headers['Content-Type'] = output_template.content_type
        self._write_template(output_template.template_file, {
            'usernames': self._render_template(
                'usernames.snippet', {'usernames': usernames}),
            'error_usernames': error_usernames and self._render_template(
                'usernames.snippet', {'usernames': error_usernames}) or '',
            'grouped_statuses': grouped_statuses, 
            
            'title': 'Twitter Digest for %s (GMT)' %
                start_date.strftime('%A, %B %d, %Y'),
            'homepage_url': homepage_url,
            'feed_url': base_digest_url + '&output=atom',
            'html_url': base_digest_url + '&output=html',
            'digest_id': digest_id,
            'digest_entry_id': digest_entry_id,
            'start_date_iso': start_date.isoformat(),
            
            'digest_contents': util.strip_html_whitespace(self._render_template(
                'twitter-digest-contents.snippet', {
                    'grouped_statuses': grouped_statuses,
                    'use_relative_dates': output_template.use_relative_dates,
                })),
        })


def main():
    application = webapp.WSGIApplication([
            ('/twitter/digest', TwitterDigestHandler),
            ('/', MainHandler),
        ],
        debug=True)
    webapp_util.run_wsgi_app(application)


if __name__ == '__main__':
    main()
