import base64
import logging
import re
import uuid
import zlib

from django.utils import simplejson
from google.appengine.ext import db

_CONSECUTIVE_WHITESPACE_RE = re.compile('[\\s]+')
# Remove all whitespace between non-anchor tags.
_TAG_WHITESPACE_RE1 = re.compile('>[\\s]+<([^a])')
# Keep one space between anchor tags, so that consecutive links don't run
# into eachother.
_TAG_WHITESPACE_RE2 = re.compile('>[\\s]+<a')

# Per http://www.w3.org/TR/REC-xml/#charsets XML disallows all control
# characters...
_CONTROL_CHARACTER_MAP = dict.fromkeys(range(32))
# ...except for
del _CONTROL_CHARACTER_MAP[0x9] # tab,
del _CONTROL_CHARACTER_MAP[0xA] # line feed,
del _CONTROL_CHARACTER_MAP[0xD] # and newline.

def strip_html_whitespace(html):
    html = _CONSECUTIVE_WHITESPACE_RE.sub(' ', html)
    html = _TAG_WHITESPACE_RE1.sub('><\\1', html)
    html = _TAG_WHITESPACE_RE2.sub('> <a', html)
    return html

def generate_id(prefix):
    return prefix + base64.urlsafe_b64encode(
        uuid.uuid4().bytes).replace('=', '')

def strip_control_characters(s):
    return s.translate(_CONTROL_CHARACTER_MAP)

class JsonProperty(db.Property):
    data_type = db.Blob

    def get_value_for_datastore(self, model_instance):
        value = self.__get__(model_instance, model_instance.__class__)
        value = simplejson.dumps(value, separators=(',',':'))
        value = zlib.compress(value)
        return db.Blob(value)

    def make_value_from_datastore(self, value):
        # Not all values are compressed, ones that aren't always start with
        # a brace (the opening of the object literal).
        if value[0] != '{':
            value = zlib.decompress(value)
        return simplejson.loads(str(value))
