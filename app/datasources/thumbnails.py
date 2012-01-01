import re
import urlparse

LARGE_THUMBNAIL = 'large'
SMALL_THUMBNAIL = 'small'

_YFROG_PATH_RE = re.compile('/(\\w+).*')
_INSTAGRAM_PATH_RE = re.compile('/p/(\\w+).*')
_FLICKR_SHORT_PATH_RE = re.compile('/p/(\\w+).*')
_FLICKR_LONG_HOSTNAME_RE = re.compile('farm\\d+\\.static\\.?flickr\\.com')
_FLICKR_LONG_PATH_RE = re.compile('(/\\d+/\\d+_[a-f0-9]+)(_.)?(\\....)')
_FLICKR_PHOTO_PAGE_PATH_RE = re.compile('/photos/[^/]+/(\d+).*')
_FLICKR_SHORT_ID_ALPHABET ='123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
_IMGUR_PATH_RE = re.compile('/(\\w+)(\\....).*')

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

    thumb_url = None
    thumb_width = None
    thumb_height = None
    need_small = size == SMALL_THUMBNAIL

    parsed_url = urlparse.urlparse(url)
    hostname = parsed_url.netloc
    path = parsed_url.path
    if hostname == 'yfrog.com':
        # See http://yfrog.com/page/api
        match = _YFROG_PATH_RE.match(path)
        if match:
            thumb_url = 'http://yfrog.com/%s' % match.group(1)
            if need_small:
                thumb_url += ':small'
            else:
                thumb_url += ':iphone'
    elif hostname == 'instagr.am':
        # See http://instagram.com/developer/embedding/#media
        match = _INSTAGRAM_PATH_RE.match(path)
        if match:
            thumb_url = 'http://instagr.am/p/%s/media' % match.group(1)
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

    return thumb_url, thumb_width, thumb_height