import logging
import os
import sys

# Tweak import path so that httplib2 (which lives in datasources) can be
# imported as httplib2 while the app is running.
# TODO(mihaip): move httplib2 (and oauth2 and python-twitter) into a third_party
# directory.
APP_DIR = os.path.abspath(os.path.dirname(__file__))
DATASOURCES_DIR = os.path.join(APP_DIR, 'datasources')
sys.path.insert(0, DATASOURCES_DIR)

from google.appengine.ext import webapp
from google.appengine.ext.webapp import util

import feedplayback.handlers

def main():
    application = webapp.WSGIApplication([
            ('/cron/feed-playback/advance', feedplayback.handlers.AdvanceHandler),
        ],
        debug=True)
    util.run_wsgi_app(application)


if __name__ == '__main__':
    main()
