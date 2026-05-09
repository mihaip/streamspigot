import logging
import re
import sys
import urllib
import urlparse
import xml.sax.saxutils
# parse_qsl moved to urlparse module in v2.6
try:
  from urlparse import parse_qsl
except:
  from cgi import parse_qsl

import base.handlers

LARGE_THUMBNAIL = 'large'
SMALL_THUMBNAIL = 'small'

_YFROG_PATH_RE = re.compile(r'/(\w+).*')
_INSTAGRAM_PATH_RE = re.compile(r'/p/([\w\-]+).*')
_FLICKR_SHORT_PATH_RE = re.compile(r'/p/(\w+).*')
_FLICKR_LONG_HOSTNAME_RE = re.compile(r'farm\d+\.static\.?flickr\.com')
_FLICKR_LONG_PATH_RE = re.compile(r'(/\d+/\d+_[a-f0-9]+)(_.)?(\....)')
_FLICKR_PHOTO_PAGE_PATH_RE = re.compile(r'/photos/[^/]+/(\d+).*')
_FLICKR_SHORT_ID_ALPHABET =r'123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
_IMGUR_PATH_RE = re.compile(r'/(\w+)(\....).*')
_IMGUR_GALLERY_PATH_RE = re.compile(r'/(gallery/)(\w+).*')
_TWITPIC_PATH_RE = re.compile(r'/(\w+).*')
_LOCKERZ_PATH_RE = re.compile(r'/s/\w+.*')
_IMGLY_FULL_PATH_RE = re.compile(r'/images/(\d+)/full.*')
_IMGLY_SHORT_PATH_RE = re.compile(r'/(\w+).*')
_OWLY_PATH_RE = re.compile(r'/i/(\w+).*')
_VINE_PATH_RE = re.compile(r'/v/(\w+).*')

def _get_short_flickr_photo_id(photo_id):
    result = ''
    base = len(_FLICKR_SHORT_ID_ALPHABET)
    while photo_id:
        div, mod = divmod(photo_id, base)
        result = _FLICKR_SHORT_ID_ALPHABET[mod] + result
        photo_id = div
    return result

def get_thumbnail_info(url, size):
    def get_thumb_url_for_short_photo_id(short_photo_id):
        return 'http://flic.kr/p/img/%s_%s.jpg' % (
            short_photo_id, size == SMALL_THUMBNAIL and 't' or 'm')

    def get_youtube_thumb_url(video_id):
        # See http://stackoverflow.com/questions/2068344
        return 'http://img.youtube.com/vi/%s/%s.jpg' % (
            video_id, need_small and 'default' or 'hqdefault')

    thumb_url = None
    thumb_width = None
    thumb_height = None
    need_small = size == SMALL_THUMBNAIL

    parsed_url = urlparse.urlparse(url)
    hostname = parsed_url.netloc
    path = parsed_url.path
    query = dict(parse_qsl(parsed_url.query))

    if hostname == 'yfrog.com':
        # See http://yfrog.com/page/api
        match = _YFROG_PATH_RE.match(path)
        if match:
            thumb_url = 'http://yfrog.com/%s' % match.group(1)
            if need_small:
                thumb_url += ':small'
            else:
                thumb_url += ':iphone'
    elif hostname in ('instagr.am', 'instagram.com', 'www.instagram.com'):
        # See http://instagram.com/developer/embedding/#media
        match = _INSTAGRAM_PATH_RE.match(path)
        if match:
            thumb_url = 'http://instagr.am/p/%s/media/' % match.group(1)
            if need_small:
                thumb_url += '?size=t'
                thumb_width = 150
                thumb_height = 150
            else:
                thumb_width = 306
                thumb_height = 306
    elif hostname == 'flic.kr':
        # See http://www.flickr.com/services/api/misc.urls.html ("Short URLs"
        # section) and http://www.flickr.com/groups/api/discuss/72157616713786392/#comment72157623145381402
        match = _FLICKR_SHORT_PATH_RE.match(path)
        if match:
            thumb_url = get_thumb_url_for_short_photo_id(match.group(1))
    elif _FLICKR_LONG_HOSTNAME_RE.match(hostname):
        # See http://www.flickr.com/services/api/misc.urls.html ("Photo Source
        # URLs" section).
        match = _FLICKR_LONG_PATH_RE.match(path)
        if match:
            path_prefix = match.group(1)
            size_suffix = match.group(2)
            extension = match.group(3)

            if size_suffix == '_o':
                # Original photos have their own secret, so so we can't generate
                # a thumbnail URL from them without doing an API call.
                thumb_url = url
            else:
                thumb_url = '%s://%s%s' % (parsed_url.scheme, hostname, path_prefix)
                if need_small:
                    thumb_url += '_t'
                thumb_url += extension
    elif hostname == 'www.flickr.com':
        # See http://www.flickr.com/services/api/misc.urls.html ("Web Page
        # URLs" section).
        match = _FLICKR_PHOTO_PAGE_PATH_RE.match(path)
        if match:
            photo_id = int(match.group(1))
            # Given a photo ID (but not its secret), all we can do is generate
            # a short URL-style thumbnail for it.
            short_photo_id = _get_short_flickr_photo_id(photo_id)
            thumb_url = get_thumb_url_for_short_photo_id(short_photo_id)
    elif hostname.startswith('i.') and hostname.endswith('.imgur.com'):
        # See http://webapps.stackexchange.com/questions/16103. We don't use
        # a strict hostname comparison so that we can handle "Pro" imgur
        # instances too (e.g. i.stack.imgur.com).
        match = _IMGUR_PATH_RE.match(path)
        if match:
            thumb_url = '%s://%s/%s%s%s' % (
                parsed_url.scheme, hostname, match.group(1),
                (need_small and 's' or 'l'), match.group(2))
    elif hostname == 'imgur.com':
        # See http://imgur.com/faq#gallery
        match = _IMGUR_GALLERY_PATH_RE.match(path)
        if match:
            thumb_url = 'http://i.imgur.com/%s%s.jpg' % (
                match.group(2), (need_small and 's' or 'l'))
    elif hostname == 'twitpic.com':
        # See http://dev.twitpic.com/docs/thumbnails/ (the 'large' size isn't
        # documented there, but it is what twitter.com seems to use).
        match = _TWITPIC_PATH_RE.match(path)
        if match:
            thumb_url = 'http://twitpic.com/show/%s/%s' % (
                need_small and 'thumb' or 'large',
                match.group(1))
            if need_small:
                thumb_width = 150
                thumb_height = 150
    elif hostname == 'lockerz.com':
        # See http://support.lockerz.com/entries/350297-image-from-url
        match = _LOCKERZ_PATH_RE.match(path)
        if match:
            thumb_url = 'http://api.plixi.com/api/tpapi.svc/imagefromurl?url=%s&size=%s' % (
                urllib.quote(url),
                need_small and 'small' or 'medium')
            if need_small:
                thumb_width = 150
                thumb_height = 150
    elif hostname == 'cl.ly':
        # See http://developer.getcloudapp.com/view-item
        thumb_url = 'http://thumbs.cl.ly%s' % path
    elif hostname == 'youtube.com' or hostname == 'www.youtube.com':
        if path == '/watch' and 'v' in query:
            thumb_url = get_youtube_thumb_url(query['v'])
    elif hostname == 'youtu.be':
        thumb_url = get_youtube_thumb_url(path[1:])
    elif hostname == 'img.ly':
        # See http://web.archive.org/web/20100606214502/http://img.ly/api/docs
        # (current API docs have removed references to thumbnails)
        match = _IMGLY_FULL_PATH_RE.match(path)
        if match:
          thumb_url = 'http://s3.amazonaws.com/imgly_production/%s/%s.jpg' % (
              match.group(1),
              need_small and 'thumb' or 'large')
        else:
            match = _IMGLY_SHORT_PATH_RE.match(path)
            if match:
                thumb_url = 'http://img.ly/show/%s/%s' % (
                    need_small and 'thumb' or 'large',
                    match.group(1))
                if need_small:
                    thumb_width = 150
                    thumb_height = 150
    elif hostname == 'ow.ly':
        # No online docs, but these paths are shown in the embed codes that
        # appear in the sidebar of any image (e.g. see http://ow.ly/i/oKuW).
        match = _OWLY_PATH_RE.match(path)
        if match:
            thumb_url = 'http://static.ow.ly/photos/%s/%s.jpg' % (
                need_small and 'thumb' or 'normal',
                match.group(1))
            if need_small:
                thumb_width = 100
                thumb_height = 100

    return thumb_url, thumb_width, thumb_height

def get_iframe_info(url):
    iframe_url = None
    iframe_width = None
    iframe_height = None

    parsed_url = urlparse.urlparse(url)
    hostname = parsed_url.netloc
    path = parsed_url.path
    query = dict(parse_qsl(parsed_url.query))

    if hostname == 'youtube.com' or hostname == 'www.youtube.com':
        if path == '/watch' and 'v' in query:
            iframe_url = 'http://www.youtube.com/embed/%s' % query['v']
            iframe_width = 350
            iframe_height = 197
    elif hostname == 'youtu.be':
        iframe_url = 'http://www.youtube.com/embed/%s' % path[1:]
        iframe_width = 350
        iframe_height = 197
    elif hostname == 'vimeo.com':
        iframe_url = 'http://player.vimeo.com/video/%s' % path[1:]
        iframe_width = 350
        iframe_height = 197
    elif hostname == 'vine.co':
        match = _VINE_PATH_RE.match(path)
        if match:
            iframe_url = 'https://vine.co/v/%s/embed/simple' % match.group(1)
            iframe_width = 350
            iframe_height = 350

    return iframe_url, iframe_width, iframe_height

class TestHandler(base.handlers.BaseHandler):
    def get(self):
        url = self.request.get('url')

        self.response.headers['Content-Type'] = 'text/html; charset=UTF-8'
        def add_field(label, value):
            self.response.out.write('<p><b>%s</b>: %s</p>' % (label, value))

        iframe_url, iframe_width, iframe_height = get_iframe_info(url)
        if iframe_url:
            add_field('iframe_url', iframe_url)
            add_field('iframe_width', iframe_width)
            add_field('iframe_height', iframe_height)
            iframe_attributes = ''
            if iframe_width and iframe_height:
                iframe_attributes = ' width="%d" height="%d"' % (
                    iframe_width, iframe_height)
            add_field('HTML',
                '<iframe src="%s" frameborder="0"%s></iframe>'
                % (xml.sax.saxutils.escape(iframe_url), iframe_attributes))

        def add_thumbnail(size):
          thumb_url, thumb_width, thumb_height = get_thumbnail_info(url, size)
          if thumb_url:
              add_field('thumb_url (%s)' % size, thumb_url)
              add_field('thumb_width (%s)' % size, thumb_width)
              add_field('thumb_height (%s)' % size, thumb_height)
              img_attributes = ''
              if thumb_width and thumb_height:
                  img_attributes = ' width="%d" height="%d"' % (
                      thumb_width, thumb_height)
              add_field('HTML (%s)',
                  '<img src="%s" alt="" style="padding:2px"%s/>'
                  % (xml.sax.saxutils.escape(thumb_url), img_attributes))

        add_thumbnail(LARGE_THUMBNAIL)
        add_thumbnail(SMALL_THUMBNAIL)
