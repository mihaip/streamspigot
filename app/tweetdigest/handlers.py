import os
import re

from base.constants import CONSTANTS
import base.handlers
import base.util
import data

class LinkFormatter(object):
    def get_attributes(self):
        return 'style="color:%s"' % CONSTANTS.ANCHOR_COLOR
LINK_FORMATTER = LinkFormatter()

class MainHandler(base.handlers.BaseHandler):
    def get(self):
        self._write_template('tweetdigest/index.html')

class ListsHandler(base.handlers.BaseHandler):
    def get(self):
        username = self.request.get('username').strip()
        if not username:
            self._write_input_error('Missing "username" parameter')
            return
    
        lists = data.get_lists(username)
        self._write_json([l.slug for l in lists])

class DigestHandler(base.handlers.BaseHandler):
    class OutputTemplate(object):
        def __init__(self, template_file, content_type, use_relative_dates):
            self.template_file = template_file
            self.content_type = content_type
            self.use_relative_dates = use_relative_dates
    OUTPUT_TEMPLATES = {
        'html': OutputTemplate(
            'tweetdigest/digest.html', 'text/html', True),
        'atom': OutputTemplate(
            'tweetdigest/digest.atom', 'text/xml', False),
    }
    def get(self):
        # Extract parameters
        usernames = []
        list_owner = None
        list_id = None
        
        if self.request.get('usernames'):
            usernames = re.split('[\\s,]+', self.request.get('usernames'))
            usernames = [u.strip().lower() for u in usernames if u.strip()]
        if self.request.get('list'):
            list = self.request.get('list').strip().lower()
            if '/' not in list:
                self._write_input_error('Malformed "list" parameter')
                return
            list_owner, list_id = list.split('/', 1)
        output_template = DigestHandler.OUTPUT_TEMPLATES.get(
            self.request.get('output'),
            DigestHandler.OUTPUT_TEMPLATES['html'])
        
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
                data.get_digest_for_usernames(
                    usernames, LINK_FORMATTER)
        else:
            (grouped_statuses, start_date, had_error) = \
                data.get_digest_for_list(
                    list_owner, list_id, LINK_FORMATTER)

        # Template parameters
        digest_errors = None
        if usernames:
            digest_source = self._render_template(
                'tweetdigest/usernames.snippet', {'usernames': usernames})
            if error_usernames:
                digest_errors = 'Errors were encountered for: %s ' \
                    '(most likely their Tweets are private).' % \
                        self._render_template(
                            'tweetdigest/usernames.snippet',
                            {'usernames': error_usernames})
            base_digest_url = '%s/tweet-digest/digest?usernames=%s' % (
                CONSTANTS.APP_URL, '+'.join(usernames))
            digest_id = '+'.join(usernames)
        else:
            digest_source = self._render_template(
                'tweetdigest/list.snippet',
                {'list_owner': list_owner, 'list_id': list_id})
            if had_error:
                digest_errors = 'Errors were encountered when fetching ' \
                    'the list (it may be private)'
            base_digest_url = '%s/tweet-digest/digest?list=%s/%s' % (
                CONSTANTS.APP_URL, list_owner, list_id)
            digest_id = '%s/%s' % (list_owner, list_id)

        digest_entry_id = digest_id + '-' + start_date.date().isoformat()
                    
        self._write_template(output_template.template_file, {
            'digest_source': digest_source,
            'digest_errors': digest_errors,
            'grouped_statuses': grouped_statuses, 
            
            'title_date': '%s (GMT)' % start_date.strftime('%A, %B %d, %Y'),
            'feed_url': base_digest_url + '&output=atom',
            'html_url': base_digest_url + '&output=html',
            'digest_id': digest_id,
            'digest_entry_id': digest_entry_id,
            'start_date_iso': start_date.isoformat(),
            
            'digest_contents': base.util.strip_html_whitespace(
                self._render_template(
                    'tweetdigest/digest-contents.snippet', {
                        'grouped_statuses': grouped_statuses,
                        'use_relative_dates': output_template.use_relative_dates,
                    })),
        },
        content_type=output_template.content_type)
