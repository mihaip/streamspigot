import logging
import os
import sys

# Tweak import path so that httplib2 (which lives in datasources) can be
# imported as httplib2 while the app is running.
# TODO(mihaip): move httplib2 (and oauth2 and python-twitter) into a third_party
# directory.
APP_DIR = os.path.abspath(os.path.dirname(__file__))
DATASOURCES_DIR = os.path.join(APP_DIR, 'datasources')
THIRD_PARTY_DIR = os.path.join(APP_DIR, 'third_party')
sys.path.insert(0, DATASOURCES_DIR)
sys.path.insert(0, THIRD_PARTY_DIR)

from google.appengine.ext import ereporter
from google.appengine.ext import webapp
from google.appengine.ext.webapp import util

import base.handlers
import birdfeeder.handlers.main
import birdfeeder.handlers.feed
import birdfeeder.handlers.pinger
import birdfeeder.handlers.session
import datasources.thumbnails
import feedplayback.handlers
import tweetdigest.handlers

class MainHandler(base.handlers.BaseHandler):
    def get(self):
        self._write_template('index.html')

class NotFoundHandler(base.handlers.BaseHandler):
    def get(self):
        self._write_not_found()

def main():
    if not os.environ['SERVER_SOFTWARE'].startswith('Development'):
        ereporter.register_logger()
    application = webapp.WSGIApplication([
            ('/tweet-digest/?', tweetdigest.handlers.MainHandler),
            ('/tweet-digest/lists', tweetdigest.handlers.ListsHandler),
            ('/tweet-digest/digest', tweetdigest.handlers.DigestHandler),
            ('/tweet-digest/legacy-digest', tweetdigest.handlers.LegacyDigestHandler),

            ('/feed-playback/?', feedplayback.handlers.MainHandler),
            ('/feed-playback/feed-info', feedplayback.handlers.FeedInfoHandler),
            ('/feed-playback/preview', feedplayback.handlers.PreviewHandler),
            ('/feed-playback/create', feedplayback.handlers.CreateHandler),
            ('/feed-playback/subscription/advance', feedplayback.handlers.SubscriptionAdvanceHandler),
            ('/feed-playback/subscription/(.*)', feedplayback.handlers.SubscriptionHandler),

            ('/bird-feeder/?', birdfeeder.handlers.main.IndexHandler),
            ('/bird-feeder/sign-in', birdfeeder.handlers.session.SignInHandler),
            ('/bird-feeder/sign-out', birdfeeder.handlers.session.SignOutHandler),
            ('/bird-feeder/callback', birdfeeder.handlers.session.CallbackHandler),
            ('/bird-feeder/reset-feed-id', birdfeeder.handlers.session.ResetFeedIdHandler),
            ('/bird-feeder/feed/timeline/(.*)', birdfeeder.handlers.feed.TimelineFeedHandler),
            ('/bird-feeder/pinger/following', birdfeeder.handlers.pinger.FollowingHandler),
            ('/bird-feeder/pinger/ping', birdfeeder.handlers.pinger.PingHandler),

            ('/thumbnails/test', datasources.thumbnails.TestHandler),

            ('/', MainHandler),
            ('/.*', NotFoundHandler),
        ],
        debug=True)
    util.run_wsgi_app(application)


if __name__ == '__main__':
    main()
