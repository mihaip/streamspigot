import logging
import os

from google.appengine.ext import webapp
from google.appengine.ext.webapp import template
from google.appengine.ext.webapp import util

class BaseHandler(webapp.RequestHandler):
    def _render_template(self, template_file_name, template_values={}):
        template_path = os.path.join(
            os.path.dirname(__file__), 'templates', template_file_name)
        self.response.out.write(template.render(template_path, template_values))
        

class MainHandler(BaseHandler):
    def get(self):
        self._render_template('index.html')


def main():
    application = webapp.WSGIApplication([('/', MainHandler)],
                                         debug=True)
    util.run_wsgi_app(application)


if __name__ == '__main__':
    main()
