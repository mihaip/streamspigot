import datetime
import itertools
import logging
import re
import string
import xml.sax.saxutils

from pytz.gae import pytz

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
    def __init__(self, user, statuses, thumbnail_size, timezone=None):
        self.user = user
        self.statuses = statuses
        self.display_statuses = DisplayStatus.wrap(
            statuses, thumbnail_size, timezone)
        self.status_pairs = itertools.izip(self.statuses, self.display_statuses)

class DisplayStatus(object):
    def __init__(self, status, thumbnail_size, timezone):
        self._status = status
        self._thumbnail_size = thumbnail_size
        self._timezone = timezone

    def permalink_status(self):
        return self._status.retweeted_status or self._status

    def permalink(self, base_url=_BASE_TWITTER_URL):
        status = self.permalink_status()
        return '%s/%s/status/%s' % (
          base_url, status.user.screen_name, status.id)

    def permalink_no_base(self):
        return self.permalink(base_url='')

    def title_as_text(self):
        # Simplified variant of the entity procesing done by body_as_html that
        # skips over all URLs.
        def get_status_title_text(status):
            title_text = ""
            urls = list((status.urls or []) + (status.medias or []))
            urls = \
                [u for u in urls if u.start_index != -1 and u.end_index != -1]
            urls.sort(cmp=lambda u1,u2: u1.start_index - u2.start_index)
            last_url_end = 0
            for url in urls:
                title_text += _unescape_tweet_chunk(
                    status.text[last_url_end:url.start_index])
                last_url_end = url.end_index
            title_text += _unescape_tweet_chunk(
                status.text[last_url_end:])

            title_text = base.util.strip_control_characters(title_text)
            title_text = _WHITESPACE_RE.sub(' ', title_text).strip()
            return title_text

        status = self._status
        if status.retweeted_status:
            title_text = 'RT @%s: %s' % (
                status.retweeted_status.user.screen_name,
                get_status_title_text(status.retweeted_status),
            )
        elif status.quoted_status:
            title_text = '%s RT @%s: %s' % (
                get_status_title_text(status),
                status.quoted_status.user.screen_name,
                get_status_title_text(status.quoted_status),
            )
        else:
            title_text = get_status_title_text(status)

        return '%s: %s' % (self._status.user.screen_name, title_text)

    def created_at_formatted(self):
        created_at_date = datetime.datetime.fromtimestamp(
            self._status.created_at_in_seconds, tz=pytz.utc)
        if self._timezone:
            created_at_date = created_at_date.astimezone(self._timezone)
            return created_at_date.strftime('%I:%M %p')

        return created_at_date.strftime('%I:%M %p GMT')

    def created_at_iso(self):
        return datetime.datetime.utcfromtimestamp(
            self._status.created_at_in_seconds).isoformat()

    def body_as_html(self):
        status = self._status
        text_as_html = []
        footer_as_html = []

        def add_status_chunks(status, skip_entity_urls=[]):
            entities = list(
                (status.hashtags or []) +
                (status.urls or []) +
                (status.user_mentions or []) +
                (status.medias or []))
            entities = [e for e in entities
                if e.start_index != -1 and e.end_index != -1]
            entities.sort(cmp=lambda e1,e2: e1.start_index - e2.start_index)
            last_entity_start = 0
            last_entity_end = 0

            for e in entities:
                add_tweet_chunk(status.text[last_entity_end:e.start_index])

                entity_anchor_text = status.text[e.start_index:e.end_index]
                entity_url = None

                if isinstance(e, twitter.Hashtag):
                    entity_url = 'search?q=%23' + e.text
                elif isinstance(e, twitter.Url):
                    entity_url = e.expanded_url or e.url
                    entity_url_anchor_text = \
                        e.display_url or e.expanded_url or e.url
                    if entity_url_anchor_text:
                        entity_anchor_text = escape(entity_url_anchor_text)
                    maybe_add_thumbnail_chunk(e.expanded_url or e.url)
                elif isinstance(e, twitter.User):
                    entity_url = e.screen_name
                elif isinstance(e, twitter.Media):
                    def add_media_thumbnail():
                        link_url, _, _ = e.GetUrlForSize(
                            twitter.Media.LARGE_SIZE)
                        thumb_url, thumb_width, thumb_height = e.GetUrlForSize(
                            twitter.Media.THUMB_SIZE
                                if self._thumbnail_size ==
                                    thumbnails.SMALL_THUMBNAIL
                                else twitter.Media.MEDIUM_SIZE)
                        add_footer_thumbnail_chunk(
                            link_url , thumb_url, thumb_width, thumb_height)

                    entity_url = e.url
                    entity_url_anchor_text = \
                        e.display_url or e.expanded_url or e.url
                    if entity_url_anchor_text:
                        entity_anchor_text = escape(entity_url_anchor_text)
                    if e.type == 'photo':
                        add_media_thumbnail()
                    elif e.type == 'animated_gif' or e.type == 'video':
                        if e.video_variants:
                            video_attributes = [
                                'loop="loop"',
                                'muted="muted"',
                                'controls="controls"',
                                'poster="%s"' % e.media_url,
                            ]
                            width = None
                            height = None
                            size = e.sizes.get(twitter.Media.MEDIUM_SIZE)
                            if size:
                                width = size[0]
                                height = size[1]
                            add_footer_video_chunk(
                                e.video_variants,
                                " ".join(video_attributes),
                                width,
                                height)
                        else:
                            add_media_thumbnail()
                    else:
                      logging.info("Unknown media type: %s", e.type)

                # Don't display the entity if it's outside the display range.
                # We only hide entities after the end of the display text
                # range, we still want to display usernames at the start of
                # the text since it's easier to scan.
                if status.display_text_range:
                  if e.start_index >= status.display_text_range[1]:
                    last_entity_start = e.start_index
                    last_entity_end = e.end_index
                    continue

                if e.start_index == last_entity_start and \
                      e.end_index == last_entity_end:
                    # For tweets with multiple pictures we will get multiple
                    # entities that point to the same span of text in the
                    # tweet. We want to insert thumbnails for each one, but only
                    # add one anchor.
                    continue

                if entity_url:
                    if entity_url not in skip_entity_urls:
                        add_raw_chunk('<a href="')
                        add_escaped_chunk(entity_url)
                        add_raw_chunk('" %s>' % _LINK_ATTRIBUTES)
                        add_tweet_chunk(entity_anchor_text)
                        add_raw_chunk('</a>')
                else:
                    add_tweet_chunk(entity_anchor_text)

                last_entity_start = e.start_index
                last_entity_end = e.end_index

            if status.display_text_range:
              add_tweet_chunk(
                  status.text[last_entity_end:status.display_text_range[1]])
            else:
              add_tweet_chunk(status.text[last_entity_end:])

            if footer_as_html:
                add_raw_chunk('<p>')
                text_as_html.extend(footer_as_html)
                add_raw_chunk('</p>')
                del footer_as_html[:]

        escape = xml.sax.saxutils.escape

        def add_raw_chunk(chunk):
            text_as_html.append(chunk)

        def add_tweet_chunk(chunk):
            # Unescape then and re-escape everything so that we can have a
            # consistent level of escaping.
            chunk = _unescape_tweet_chunk(chunk)

            # We also remove control characters (which are not allowed in XML)
            # now, instead of earlier, since otherwise all of the entity offsets
            # would be wrong.
            chunk = base.util.strip_control_characters(chunk)

            # Insert zero-width spaces after punctuation and every so often in
            # longer tokens to make sure that the display wraps. Has to be done
            # this way since NewsBlur's CSS whitelist does not allow
            # "word-break: break-word" and its HTML whitelist does not allow
            # <wbr> tags.
            run_length = 0
            chunk_with_breaks = u""
            for c in chunk:
              chunk_with_breaks += c
              run_length += 1
              if c in string.whitespace:
                run_length = 0
              elif c in string.punctuation or run_length > 24:
                chunk_with_breaks += u"\u200B"
                run_length = 0
            chunk = chunk_with_breaks

            # HTML-escape
            chunk = escape(chunk)

            # Convert newlines to HTML (Twitter seems to normalize all line
            # endings to \n).
            chunk = chunk.replace('\n', '<br/>')

            add_raw_chunk(chunk)

        def add_escaped_chunk(chunk):
            add_raw_chunk(escape(chunk))

        def add_footer_raw_chunk(chunk):
            footer_as_html.append(chunk)

        def add_footer_thumbnail_chunk(
                link_url, thumb_url, thumb_width, thumb_height):
            img_styles = ['padding:2px']
            img_attributes = ''
            # Force the width to be "100%" and reset the margins to override the
            # "full bleed" style set by NewsBlur (see https://github.com/
            # samuelclay/NewsBlur/commit/93c4ddfc30e6b126118e07e76bdf367ff84b).
            # There needs to be a space between the value and !important since
            # its CSS sanitizer breaks up tokens via whitespace only (
            # https://github.com/samuelclay/NewsBlur/blob/
            # 4aead01e3442eadfcbb7e5cf451e55184386a/utils/feedparser.py#L2539)
            # The triggering conditions match the NB-large-image class being
            # added in https://github.com/samuelclay/NewsBlur/blob/
            # fb3b37a46028a1222be2f1f5f6f0cea63e895666/clients/ios/static/
            # storyDetailView.js#L63
            if thumb_width >= 320-24 and thumb_height >= 50 or \
                (not thumb_width and not thumb_height and
                    self._thumbnail_size == thumbnails.LARGE_THUMBNAIL):
                img_styles.append('width:100% !important')
                img_styles.append('margin: 0 !important')
            if thumb_width and thumb_height:
                img_attributes = ' width="%d" height="%d"' % (
                    thumb_width, thumb_height)

            add_footer_raw_chunk(
                '<a href="%s" border="0">'
                  '<img src="%s" alt="" style="%s"%s/>'
                '</a>' % (
                    escape(link_url),
                    escape(thumb_url),
                    ";".join(img_styles),
                    img_attributes
                ))

        def add_footer_iframe_chunk(iframe_url, iframe_width, iframe_height):
            # "frameborder" is not a whitelisted HTML attribute in NewsBlur.
            # "border" is not on its CSS whitelist either, but "border-color"
            # is.
            iframe_attributes = ' style="border-color: transparent"'
            if iframe_width and iframe_height:
                iframe_attributes += ' width="%d" height="%d"' % (
                    iframe_width, iframe_height)
            add_footer_raw_chunk(
                '<iframe src="%s" frameborder="0"%s allowfullscreen="true"></iframe>'
                % (escape(iframe_url), iframe_attributes))

        def add_footer_video_chunk(
                video_variants, video_attributes, width=None, height=None):
            if width:
                video_attributes += (' width="%d" '
                    'style="width:100%%;max-width:%dpx"') % (width, width)
            add_footer_raw_chunk('<video %s>' % video_attributes)
            for variant in video_variants:
                if variant.url:
                    add_footer_raw_chunk('<source src="%s" type="%s"/>' % (
                        variant.url, variant.content_type or ''))
            add_footer_raw_chunk('</video>')

        def maybe_add_thumbnail_chunk(url):
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

        def add_status(status):
            if status.retweeted_status:
                add_raw_chunk('RT: <a href="')
                add_escaped_chunk(status.retweeted_status.user.screen_name)
                add_raw_chunk('" %s>@' % _LINK_ATTRIBUTES)
                add_escaped_chunk(status.retweeted_status.user.screen_name)
                add_raw_chunk('</a>: ')
                add_status(status.retweeted_status)
            elif status.quoted_status:
                quoted_screen_name = status.quoted_status.user.screen_name
                add_status_chunks(status, skip_entity_urls=[
                    "https://twitter.com/%s/status/%s" %
                        (quoted_screen_name, status.quoted_status.id)
                ])
                add_raw_chunk('<div style="padding:10px;margin:5px 0;background:%s">' %
                    CONSTANTS.BUBBLE_QUOTED_COLOR)
                add_raw_chunk('<a href="')
                add_escaped_chunk(quoted_screen_name)
                add_raw_chunk('" %s>@' % _LINK_ATTRIBUTES)
                add_escaped_chunk(quoted_screen_name)
                add_raw_chunk('</a>: ')
                add_status(status.quoted_status)
                add_raw_chunk('</div>')
            else:
                add_status_chunks(status)
        add_status(status)

        result = ''.join(text_as_html)
        return result

    @staticmethod
    def wrap(statuses, thumbnail_size, timezone):
        return [DisplayStatus(s, thumbnail_size, timezone) for s in statuses]

# Per https://dev.twitter.com/docs/api/1/post/account/settings, the Twitter
# API uses Rails timezone names.
# http://api.rubyonrails.org/classes/ActiveSupport/TimeZone.html provides a
# mapping to tz database names.
_RAILS_TIMEZONE_NAME_TO_TZ_NAME = {
    'International Date Line West': 'Pacific/Midway',
    'Midway Island': 'Pacific/Midway',
    'Samoa': 'Pacific/Pago_Pago',
    'Hawaii': 'Pacific/Honolulu',
    'Alaska': 'America/Juneau',
    'Pacific Time (US & Canada)': 'America/Los_Angeles',
    'Tijuana': 'America/Tijuana',
    'Mountain Time (US & Canada)': 'America/Denver',
    'Arizona': 'America/Phoenix',
    'Chihuahua': 'America/Chihuahua',
    'Mazatlan': 'America/Mazatlan',
    'Central Time (US & Canada)': 'America/Chicago',
    'Saskatchewan': 'America/Regina',
    'Guadalajara': 'America/Mexico_City',
    'Mexico City': 'America/Mexico_City',
    'Monterrey': 'America/Monterrey',
    'Central America': 'America/Guatemala',
    'Eastern Time (US & Canada)': 'America/New_York',
    'Indiana (East)': 'America/Indiana/Indianapolis',
    'Bogota': 'America/Bogota',
    'Lima': 'America/Lima',
    'Quito': 'America/Lima',
    'Atlantic Time (Canada)': 'America/Halifax',
    'Caracas': 'America/Caracas',
    'La Paz': 'America/La_Paz',
    'Santiago': 'America/Santiago',
    'Newfoundland': 'America/St_Johns',
    'Brasilia': 'America/Sao_Paulo',
    'Buenos Aires': 'America/Argentina/Buenos_Aires',
    'Georgetown': 'America/Guyana',
    'Greenland': 'America/Godthab',
    'Mid-Atlantic': 'Atlantic/South_Georgia',
    'Azores': 'Atlantic/Azores',
    'Cape Verde Is.': 'Atlantic/Cape_Verde',
    'Dublin': 'Europe/Dublin',
    'Edinburgh': 'Europe/London',
    'Lisbon': 'Europe/Lisbon',
    'London': 'Europe/London',
    'Casablanca': 'Africa/Casablanca',
    'Monrovia': 'Africa/Monrovia',
    'UTC': 'Etc/UTC',
    'Belgrade': 'Europe/Belgrade',
    'Bratislava': 'Europe/Bratislava',
    'Budapest': 'Europe/Budapest',
    'Ljubljana': 'Europe/Ljubljana',
    'Prague': 'Europe/Prague',
    'Sarajevo': 'Europe/Sarajevo',
    'Skopje': 'Europe/Skopje',
    'Warsaw': 'Europe/Warsaw',
    'Zagreb': 'Europe/Zagreb',
    'Brussels': 'Europe/Brussels',
    'Copenhagen': 'Europe/Copenhagen',
    'Madrid': 'Europe/Madrid',
    'Paris': 'Europe/Paris',
    'Amsterdam': 'Europe/Amsterdam',
    'Berlin': 'Europe/Berlin',
    'Bern': 'Europe/Berlin',
    'Rome': 'Europe/Rome',
    'Stockholm': 'Europe/Stockholm',
    'Vienna': 'Europe/Vienna',
    'West Central Africa': 'Africa/Algiers',
    'Bucharest': 'Europe/Bucharest',
    'Cairo': 'Africa/Cairo',
    'Helsinki': 'Europe/Helsinki',
    'Kyiv': 'Europe/Kiev',
    'Riga': 'Europe/Riga',
    'Sofia': 'Europe/Sofia',
    'Tallinn': 'Europe/Tallinn',
    'Vilnius': 'Europe/Vilnius',
    'Athens': 'Europe/Athens',
    'Istanbul': 'Europe/Istanbul',
    'Minsk': 'Europe/Minsk',
    'Jerusalem': 'Asia/Jerusalem',
    'Harare': 'Africa/Harare',
    'Pretoria': 'Africa/Johannesburg',
    'Moscow': 'Europe/Moscow',
    'St. Petersburg': 'Europe/Moscow',
    'Volgograd': 'Europe/Moscow',
    'Kuwait': 'Asia/Kuwait',
    'Riyadh': 'Asia/Riyadh',
    'Nairobi': 'Africa/Nairobi',
    'Baghdad': 'Asia/Baghdad',
    'Tehran': 'Asia/Tehran',
    'Abu Dhabi': 'Asia/Muscat',
    'Muscat': 'Asia/Muscat',
    'Baku': 'Asia/Baku',
    'Tbilisi': 'Asia/Tbilisi',
    'Yerevan': 'Asia/Yerevan',
    'Kabul': 'Asia/Kabul',
    'Ekaterinburg': 'Asia/Yekaterinburg',
    'Islamabad': 'Asia/Karachi',
    'Karachi': 'Asia/Karachi',
    'Tashkent': 'Asia/Tashkent',
    'Chennai': 'Asia/Kolkata',
    'Kolkata': 'Asia/Kolkata',
    'Mumbai': 'Asia/Kolkata',
    'New Delhi': 'Asia/Kolkata',
    'Kathmandu': 'Asia/Kathmandu',
    'Astana': 'Asia/Dhaka',
    'Dhaka': 'Asia/Dhaka',
    'Sri Jayawardenepura': 'Asia/Colombo',
    'Almaty': 'Asia/Almaty',
    'Novosibirsk': 'Asia/Novosibirsk',
    'Rangoon': 'Asia/Rangoon',
    'Bangkok': 'Asia/Bangkok',
    'Hanoi': 'Asia/Bangkok',
    'Jakarta': 'Asia/Jakarta',
    'Krasnoyarsk': 'Asia/Krasnoyarsk',
    'Beijing': 'Asia/Shanghai',
    'Chongqing': 'Asia/Chongqing',
    'Hong Kong': 'Asia/Hong_Kong',
    'Urumqi': 'Asia/Urumqi',
    'Kuala Lumpur': 'Asia/Kuala_Lumpur',
    'Singapore': 'Asia/Singapore',
    'Taipei': 'Asia/Taipei',
    'Perth': 'Australia/Perth',
    'Irkutsk': 'Asia/Irkutsk',
    'Ulaan Bataar': 'Asia/Ulaanbaatar',
    'Seoul': 'Asia/Seoul',
    'Osaka': 'Asia/Tokyo',
    'Sapporo': 'Asia/Tokyo',
    'Tokyo': 'Asia/Tokyo',
    'Yakutsk': 'Asia/Yakutsk',
    'Darwin': 'Australia/Darwin',
    'Adelaide': 'Australia/Adelaide',
    'Canberra': 'Australia/Melbourne',
    'Melbourne': 'Australia/Melbourne',
    'Sydney': 'Australia/Sydney',
    'Brisbane': 'Australia/Brisbane',
    'Hobart': 'Australia/Hobart',
    'Vladivostok': 'Asia/Vladivostok',
    'Guam': 'Pacific/Guam',
    'Port Moresby': 'Pacific/Port_Moresby',
    'Magadan': 'Asia/Magadan',
    'Solomon Is.': 'Asia/Magadan',
    'New Caledonia': 'Pacific/Noumea',
    'Fiji': 'Pacific/Fiji',
    'Kamchatka': 'Asia/Kamchatka',
    'Marshall Is.': 'Pacific/Majuro',
    'Auckland': 'Pacific/Auckland',
    'Wellington': 'Pacific/Auckland',
    'Nuku\'alofa': 'Pacific/Tongatapu'
}

def get_timezone_for_user(user):
    if user.time_zone:
        try:
            timezone_name = _RAILS_TIMEZONE_NAME_TO_TZ_NAME.get(
                user.time_zone, user.time_zone)
            return pytz.timezone(timezone_name)
        except pytz.UnknownTimeZoneError:
            logging.info('Unknown timezone name: ' + timezone_name)
            pass

    if user.utc_offset:
        timezone = pytz.FixedOffset(user.utc_offset/60)
        # pytz FixedOffset instances return None for dst(), but then
        # astimezone() complains, so we just pretend like the DST offset
        # is always 0.
        timezone.dst = lambda self: datetime.timedelta(0)
        return timezone

    return None
