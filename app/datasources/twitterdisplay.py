import datetime
import itertools
import re
import xml.sax.saxutils

from base.constants import CONSTANTS
import base.util
from datasources import thumbnails, twitter

_BASE_TWITTER_URL = 'https://twitter.com'
_LINK_ATTRIBUTES = 'style="color:%s"' % CONSTANTS.ANCHOR_COLOR
_WHITESPACE_RE = re.compile('\\s+')

# Twitter escapes < and > in status texts, but not & (see
# http://code.google.com/p/twitter-api/issues/detail?id=1695). To be safe, we
# unescape &amp too, in case the Twitter bug does get fixed.
def _unescape_tweet_chunk(chunk):
    return chunk.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')

class DisplayStatusGroup(object):
    def __init__(self, user, statuses, thumbnail_size):
        self.user = user
        self.statuses = statuses
        self.display_statuses = DisplayStatus.wrap(statuses, thumbnail_size)
        self.status_pairs = itertools.izip(self.statuses, self.display_statuses)

class DisplayStatus(object):
    def __init__(self, status, thumbnail_size):
        self._status = status
        self._thumbnail_size = thumbnail_size

    def permalink(self, base_url=_BASE_TWITTER_URL):
        return '%s/%s/status/%s' % (
            base_url, self._status.user.screen_name, self._status.id)

    def permalink_no_base(self):
        return self.url(base_url='')

    def title_as_text(self):
        title_text = _unescape_tweet_chunk(self._status.text)
        title_text = _WHITESPACE_RE.sub(' ', title_text)
        title_text = base.util.strip_control_characters(title_text)
        return '%s: %s' % (self._status.user.screen_name, title_text)

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
            # We also remove control characters (which are not allowed in XML)
            # now, instead of earlier, since otherwise all of the entity offsets
            # would be wrong.
            add_escaped_chunk(base.util.strip_control_characters(
                _unescape_tweet_chunk(chunk)))

        def add_escaped_chunk(chunk):
            add_raw_chunk(xml.sax.saxutils.escape(chunk))

        def add_footer_raw_chunk(chunk):
            footer_as_html.append(chunk)

        def add_footer_thumbnail_chunk(
                link_url, thumb_url, thumb_width, thumb_height):
            img_attributes = ''
            if thumb_width and thumb_height:
                img_attributes = ' width="%d" height="%d"' % (
                    thumb_width, thumb_height)
            add_footer_raw_chunk(
                '<a href="%s" border="0">'
                  '<img src="%s" alt="" style="padding:2px"%s/>'
                '</a>' %
                (link_url , thumb_url, img_attributes))

        def add_footer_iframe_chunk(iframe_url, iframe_width, iframe_height):
            iframe_attributes = ''
            if iframe_width and iframe_height:
                iframe_attributes = ' width="%d" height="%d"' % (
                    iframe_width, iframe_height)
            add_footer_raw_chunk(
                '<iframe src="%s" frameborder="0" allowfullscreen %s></iframe>'
                % (iframe_url, iframe_attributes))

        def maybe_add_thumbnail_chunk(url):
            # If the caller is OK with large thumbnails, chances are they're
            # OK with actual embedded content too.
            if self._thumbnail_size == thumbnails.LARGE_THUMBNAIL:
                iframe_url, iframe_width, iframe_height = \
                    thumbnails.get_iframe_info(url)
                if iframe_url:
                    add_footer_iframe_chunk(
                        iframe_url, iframe_width, iframe_height)
                    return

            thumb_url, thumb_width, thumb_height = \
                thumbnails.get_thumbnail_info(url, self._thumbnail_size)
            if thumb_url:
                add_footer_thumbnail_chunk(
                    url, thumb_url, thumb_width, thumb_height)

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
              maybe_add_thumbnail_chunk(e.expanded_url or e.url)
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
                thumb_url, thumb_width, thumb_height = e.GetUrlForSize(
                    self._thumbnail_size == thumbnails.SMALL_THUMBNAIL and
                        twitter.Media.THUMB_SIZE or twitter.Media.MEDIUM_SIZE)
                add_footer_thumbnail_chunk(
                    link_url , thumb_url, thumb_width, thumb_height)

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
    def wrap(statuses, thumbnail_size):
        return [DisplayStatus(s, thumbnail_size) for s in statuses]
