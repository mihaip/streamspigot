import datetime
import itertools
import xml.sax.saxutils

from base.constants import CONSTANTS
from datasources import twitter

_BASE_TWITTER_URL = 'https://twitter.com'
_LINK_ATTRIBUTES = 'style="color:%s"' % CONSTANTS.ANCHOR_COLOR

# Twitter escapes < and > in status texts, but not & (see
# http://code.google.com/p/twitter-api/issues/detail?id=1695). To be safe, we
# unescape &amp too, in case the Twitter bug does get fixed.
def _unescape_tweet_chunk(chunk):
    return chunk.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')

class StatusGroup(object):
    def __init__(self, user, statuses):
        self.user = user
        self.statuses = statuses
        self.display_statuses = DisplayStatus.wrap(statuses)
        self.status_pairs = itertools.izip(self.statuses, self.display_statuses)

class DisplayStatus(object):
    def __init__(self, status):
        self._status = status

    def permalink(self, base_url=_BASE_TWITTER_URL):
        return '%s/%s/status/%s' % (
            base_url, self._status.user.screen_name, self._status.id)

    def permalink_no_base(self):
        return self.url(base_url='')

    def title_as_text(self):
        return '%s: %s' % (
            self._status.user.screen_name,
            _unescape_tweet_chunk(self._status.text))

    def created_at_formatted_gmt(self):
        return datetime.datetime.utcfromtimestamp(
            self._status.created_at_in_seconds).strftime("%I:%M %p")

    def created_at_iso(self):
        return datetime.datetime.utcfromtimestamp(
            self._status.created_at_in_seconds).isoformat()

    def body_as_html(self):
        status = self._status
        text_as_html = []
        footer_as_html = []

        def add_raw_chunk(chunk):
            text_as_html.append(chunk)

        def add_tweet_chunk(chunk):
            # Unescape then and re-escape everything so that we can have a
            # consistent level of escaping.
            add_escaped_chunk(_unescape_tweet_chunk(chunk))

        def add_escaped_chunk(chunk):
            add_raw_chunk(xml.sax.saxutils.escape(chunk))

        def add_footer_raw_chunk(chunk):
            footer_as_html.append(chunk)

        # For native retweets, render retweeted status, so that the RT prefix is
        # not counted against the 140 character limit and so that we get media
        # entities.
        if status.retweeted_status:
            status = status.retweeted_status
            add_raw_chunk('RT: <a href="')
            add_escaped_chunk(status.user.screen_name)
            add_raw_chunk('" %s>@' % _LINK_ATTRIBUTES)
            add_escaped_chunk(status.user.screen_name)
            add_raw_chunk('</a>: ')

        entities = list(
            (status.hashtags or []) +
            (status.urls or []) +
            (status.user_mentions or []) +
            (status.medias or []))
        entities = [
            e for e in entities if e.start_index != -1 and e.end_index != -1]
        entities.sort(cmp=lambda e1,e2: e1.start_index - e2.start_index)
        last_entity_end = 0

        for e in entities:
          add_tweet_chunk(status.text[last_entity_end:e.start_index])

          entity_anchor_text = status.text[e.start_index:e.end_index]
          entity_url = None

          if isinstance(e, twitter.Hashtag):
              entity_url = 'search?q=%23' + e.text
          elif isinstance(e, twitter.Url):
              entity_url = e.url
              entity_url_anchor_text = e.display_url or e.expanded_url or e.url
              if entity_url_anchor_text:
                  entity_anchor_text = xml.sax.saxutils.escape(entity_url_anchor_text)
          elif isinstance(e, twitter.User):
              entity_url = e.screen_name
          elif isinstance(e, twitter.Media):
              entity_url = e.url
              entity_url_anchor_text = e.display_url or e.expanded_url or e.url
              if entity_url_anchor_text:
                  entity_anchor_text = xml.sax.saxutils.escape(entity_url_anchor_text)
              if e.type == 'photo':
                # Appending /large seems to generate a lightbox view of that image
                link_url = e.expanded_url + '/large'
                thumb_url, thumb_width, thumb_height = \
                    e.GetUrlForSize(twitter.Media.THUMB_SIZE)
                add_footer_raw_chunk(
                    '<a href="%s" border="0">'
                      '<img src="%s" width="%d" height="%d" alt=""/>'
                    '</a>' %
                    (link_url , thumb_url, thumb_width, thumb_height))

          if entity_url:
              add_raw_chunk('<a href="')
              add_escaped_chunk(entity_url)
              add_raw_chunk('" %s>' % _LINK_ATTRIBUTES)
              add_tweet_chunk(entity_anchor_text)
              add_raw_chunk('</a>')
          else:
              add_tweet_chunk(entity_anchor_text)

          last_entity_end = e.end_index

        add_tweet_chunk(status.text[last_entity_end:])

        result = ''.join(text_as_html)
        if footer_as_html:
          result += '<p>' + ''.join(footer_as_html) + '</p>'
        return result

    @staticmethod
    def wrap(statuses):
        return [DisplayStatus(s) for s in statuses]
