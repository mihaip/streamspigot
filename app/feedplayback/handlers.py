import base.handlers

class MainHandler(base.handlers.BaseHandler):
    def get(self):
        self._write_template('feedplayback/index.html')