import wsgiref.handlers

from google.appengine.ext import webapp

class MainPage(webapp.RequestHandler):
    def get(self):
      self.redirect('http://www.streamspigot.com/tweet-digest/')

class GenerateDigest(webapp.RequestHandler):
    def get(self):
        self.redirect('http://www.streamspigot.com/tweet-digest/legacy-digest?' + self.request.query_string)

def main():
    application = webapp.WSGIApplication([
            ('/', MainPage),
            ('/generate', GenerateDigest),
        ],
        debug=True)
    wsgiref.handlers.CGIHandler().run(application)

if __name__ == "__main__":
    main()
