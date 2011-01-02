import logging
import os

from django.utils import simplejson
from google.appengine.ext import ereporter
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
    
    def _write_input_error(self, error_message):
        self.response.headers['Content-Type'] = 'text/plain'
        self.response.set_status(400)
        self.response.out.write('Input error: %s' % error_message)
        
    def _write_json(self, obj):
        self.response.headers['Content-Type'] = 'application/json'
        self.response.out.write(simplejson.dumps(obj))

class LinkFormatter(object):
    def get_attributes(self):
        return 'style="color:%s"' % CONSTANTS['ANCHOR_COLOR']
LINK_FORMATTER = LinkFormatter()

class MainHandler(BaseHandler):
    def get(self):
        self._write_template('index.html')

class TwitterListsHandler(BaseHandler):
    def get(self):
        username = self.request.get('username').strip()
        if not username:
            self._write_input_error('Missing "username" parameter')
            return
    
        lists = twitterdigest.get_lists(username)
        self._write_json([l.slug for l in lists])

class TwitterDigestHandler(BaseHandler):
    class OutputTemplate(object):
        def __init__(self, template_file, content_type, use_relative_dates):
            self.template_file = template_file
            self.content_type = content_type
            self.use_relative_dates = use_relative_dates
    OUTPUT_TEMPLATES = {
        'html': OutputTemplate(
            'twitterdigest/twitter-digest.html', 'text/html', True),
        'atom': OutputTemplate(
            'twitterdigest/twitter-digest.atom', 'text/xml', False),
    }
    def get(self):
        # Extract parameters
        usernames = []
        list_owner = None
        list_id = None
        
        if self.request.get('usernames'):
            usernames = self.request.get('usernames').strip().split(' ')
            usernames = [u.strip().lower() for u in usernames if u.strip()]
        if self.request.get('list'):
            list = self.request.get('list').strip().lower()
            if '/' not in list:
                self._write_input_error('Malformed "list" parameter')
                return
            list_owner, list_id = list.split('/', 1)
        output_template = TwitterDigestHandler.OUTPUT_TEMPLATES.get(
            self.request.get('output'),
            TwitterDigestHandler.OUTPUT_TEMPLATES['html'])
        
        if not usernames and not list_owner:
            self._write_input_error(
                'Must provide either a "usernames" or "list" parameter')
            return
        
        if usernames and list_owner:
            self._write_input_error(
                'Must provide only one of the "usernames" or "list" parameters')
            return
        
        # Generate digest
        if usernames:
            (grouped_statuses, start_date, error_usernames) = \
                twitterdigest.get_digest_for_usernames(
                    usernames, LINK_FORMATTER)
        else:
            (grouped_statuses, start_date, had_error) = \
                twitterdigest.get_digest_for_list(
                    list_owner, list_id, LINK_FORMATTER)

        # Template parameters
        homepage_url = 'http://' + os.environ.get('SERVER_NAME', '')
        
        digest_errors = None
        if usernames:
            digest_source = self._render_template(
                'twitterdigest/usernames.snippet', {'usernames': usernames})
            if error_usernames:
                digest_errors = 'Errors were encountered for: %s ' \
                    '(most likely their Tweets are private).' % \
                        self._render_template(
                            'twitterdigest/usernames.snippet',
                            {'usernames': error_usernames})
            base_digest_url = homepage_url + '/twitter/digest?usernames=' + \
                '+'.join(usernames)
            digest_id = '+'.join(usernames)
        else:
            digest_source = self._render_template(
                'twitterdigest/twitter-list.snippet',
                {'list_owner': list_owner, 'list_id': list_id})
            if had_error:
                digest_errors = 'Errors were encountered when fetching ' \
                    'the list (it may be private)'
            base_digest_url = homepage_url + '/twitter/digest?list=%s/%s' % (
                list_owner, list_id)
            digest_id = '%s/%s' % (list_owner, list_id)

        digest_entry_id = digest_id + '-' + start_date.date().isoformat()
                    
        self.response.headers['Content-Type'] = \
            '%s; charset=utf-8' % output_template.content_type
        self._write_template(output_template.template_file, {
            'digest_source': digest_source,
            'digest_errors': digest_errors,
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
                'twitterdigest/twitter-digest-contents.snippet', {
                    'grouped_statuses': grouped_statuses,
                    'use_relative_dates': output_template.use_relative_dates,
                })),
        })


def main():
    ereporter.register_logger()
    application = webapp.WSGIApplication([
            ('/twitter/lists', TwitterListsHandler),
            ('/twitter/digest', TwitterDigestHandler),
            ('/', MainHandler),
        ],
        debug=True)
    webapp_util.run_wsgi_app(application)


if __name__ == '__main__':
    main()
