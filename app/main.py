import logging

from google.appengine.ext import ereporter
from google.appengine.ext import webapp
from google.appengine.ext.webapp import util

import base.handlers
import tweetdigest.handlers
import feedplayback.handlers

class MainHandler(base.handlers.BaseHandler):
    def get(self):
        self._write_template('index.html')

def main():
    ereporter.register_logger()
    application = webapp.WSGIApplication([
            ('/tweet-digest/?', tweetdigest.handlers.MainHandler),
            ('/tweet-digest/lists', tweetdigest.handlers.ListsHandler),
            ('/tweet-digest/digest', tweetdigest.handlers.DigestHandler),

            ('/feed-playback/?', feedplayback.handlers.MainHandler),
            ('/feed-playback/feed-info', feedplayback.handlers.FeedInfoHandler),
            ('/feed-playback/create', feedplayback.handlers.CreateHandler),

            ('/', MainHandler),
        ],
        debug=True)
    util.run_wsgi_app(application)


if __name__ == '__main__':
    main()
