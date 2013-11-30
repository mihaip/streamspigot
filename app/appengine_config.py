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
        # one is actually looking at the resuts. Make the block be a 200
        # response, so that it gets cached by App Engine's edge cache (and
        # hopefully Trawler too).
        if user_agent.startswith('Feedfetcher-Google;'):
            logging.info('Blocked Feedfetcher request')
            start_response('200 OK', [
                ('Content-type','text/xml; charset=UTF-8'),
                ('Last-Modified', 'Tue, 2 Jul 2013 00:00:00 GMT'),
                ('Expires', 'Sun, 2 Jul 2023 00:00:00 GMT'),
                ('Cache-Control', 'public, max-age=315570000'),
            ])
            return ['''<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:streamspigot.com,2013:/feedfetcher-go-away</id>
  <title>Stream Spigot</title>
  <entry>
    <id>tag:streamspigot.com,2013:/feedfetcher-go-away</id>
    <title type="text">Feedfetcher, why are you still crawling?</title>
    <content type="xhtml">
      <div xmlns="http://www.w3.org/1999/xhtml">
        Since <a href="http://googlereader.blogspot.com/2013/07/a-final-farewell.html">Reader</a> and <a href="https://support.google.com/websearch/answer/2664197?hl=en">iGoogle</a> are shut down, why is <a href="http://www.google.com/feedfetcher.html">Feedfetcher</a> still crawling?
      </div>
    </content>
  </entry>
</feed>
''']
        return self._wrapped_app(environ, start_response)

def webapp_add_wsgi_middleware(app):
    from google.appengine.ext.appstats import recording
    app = recording.appstats_wsgi_middleware(app)

    app = BlockingMiddleware(app)

    return app
