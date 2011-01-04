import logging

from google.appengine.ext import ereporter
from google.appengine.ext import webapp
from google.appengine.ext.webapp import util

import base.handlers
import twitterdigest.handlers

class MainHandler(base.handlers.BaseHandler):
    def get(self):
        self._write_template('index.html')

def main():
    ereporter.register_logger()
    application = webapp.WSGIApplication([
            ('/twitter-digest/?', twitterdigest.handlers.MainHandler),
            ('/twitter-digest/lists', twitterdigest.handlers.TwitterListsHandler),
            ('/twitter-digest/digest', twitterdigest.handlers.TwitterDigestHandler),
            ('/', MainHandler),
        ],
        debug=True)
    util.run_wsgi_app(application)


if __name__ == '__main__':
    main()
