import webapp2

class MainPage(webapp2.RequestHandler):
    def get(self):
      self.redirect('http://www.streamspigot.com/tweet-digest/')

class GenerateDigest(webapp2.RequestHandler):
    def get(self):
        self.redirect(
            'http://www.streamspigot.com/tweet-digest/legacy-digest?' +
            self.request.query_string)

app = webapp2.WSGIApplication([
    ('/', MainPage),
    ('/generate', GenerateDigest),
])
