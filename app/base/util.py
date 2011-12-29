import base64
import re
import uuid

from django.utils import simplejson
from django.utils.html import strip_spaces_between_tags
from google.appengine.ext import db

_CONSECUTIVE_WHITESPACE_RE = re.compile('[\\s]+')
_TAG_WHITESPACE_RE1 = re.compile('>[\\s]+<([^a])')
_TAG_WHITESPACE_RE2 = re.compile('>[\\s]+<a')

def strip_html_whitespace(html):
    html = strip_spaces_between_tags(html)
    html = _CONSECUTIVE_WHITESPACE_RE.sub(' ', html)
    html = _TAG_WHITESPACE_RE1.sub('><\\1', html)
    html = _TAG_WHITESPACE_RE2.sub('> <a', html)
    return html

def generate_id(prefix):
    return prefix + base64.urlsafe_b64encode(
        uuid.uuid4().bytes).replace('=', '')

class JsonProperty(db.Property):
    data_type = db.Blob

    def get_value_for_datastore(self, model_instance):
        value = self.__get__(model_instance, model_instance.__class__)
        value = simplejson.dumps(value)
        return db.Blob(value)

    def make_value_from_datastore(self, value):
        return simplejson.loads(str(value))
