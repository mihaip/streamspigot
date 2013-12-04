import logging

from google.appengine.dist import use_library
use_library('django', '1.2')

appstats_RECORD_FRACTION = .1

class BlockingMiddleware(object):
    def __init__(self, app):
        self._wrapped_app = app

    def __call__(self, environ, start_response):
        user_agent = environ.get('HTTP_USER_AGENT', '')
        # Scraper running on EC2 (IP addresses 50.18.2.106 and 50.18.73.38)
        # that's requesting lots of Tweet Digest pages.
        if user_agent == 'Python-urllib/2.7':
            logging.info('Blocked request')
            start_response('403 Forbidden', [('Content-type','text/plain')])
            return ['']

        # Google Reader and iGoogle are dead, yet their crawler still lives on.
        # (and generates ~1,200 requests per day). Block it, since presumably no
        # one is actually looking at the resuts.
        if user_agent.startswith('Feedfetcher-Google;'):
            logging.info('Blocked Feedfetcher request')
            start_response('403 Forbidden', [('Content-type','text/plain')])
            return ['']

        return self._wrapped_app(environ, start_response)

def webapp_add_wsgi_middleware(app):
    from google.appengine.ext.appstats import recording
    app = recording.appstats_wsgi_middleware(app)

    app = BlockingMiddleware(app)

    return app
