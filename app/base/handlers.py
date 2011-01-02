import os

from django.utils import simplejson
from google.appengine.ext import webapp
from google.appengine.ext.webapp import template

import base.constants

class BaseHandler(webapp.RequestHandler):
    def _render_template(self, template_file_name, template_values={}):
        template_path = os.path.join(
            os.path.dirname(__file__), '..', 'templates', template_file_name)
        template_values.update(base.constants.CONSTANTS)
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
