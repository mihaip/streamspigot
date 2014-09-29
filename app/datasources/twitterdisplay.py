import datetime
import itertools
import logging
import re
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

            # HTML-escape
            chunk = xml.sax.saxutils.escape(chunk)

            # Convert newlines to HTML (Twitter seems to normalize all line
            # endings to \n).
            chunk = chunk.replace('\n', '<br/>')

            add_raw_chunk(chunk)

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
                '</a>' % (
                    xml.sax.saxutils.escape(link_url),
                    xml.sax.saxutils.escape(thumb_url),
                    img_attributes
                ))

        def add_footer_iframe_chunk(iframe_url, iframe_width, iframe_height):
            iframe_attributes = ''
            if iframe_width and iframe_height:
                iframe_attributes = ' width="%d" height="%d"' % (
                    iframe_width, iframe_height)
            add_footer_raw_chunk(
                '<iframe src="%s" frameborder="0"%s allowfullscreen="true"></iframe>'
                % (xml.sax.saxutils.escape(iframe_url), iframe_attributes))

        def add_footer_video_chunk(video_url, video_attributes):
            add_footer_raw_chunk(
                '<video src="%s" %s></video>' % (
                  xml.sax.saxutils.escape(video_url), video_attributes))

        def maybe_add_thumbnail_chunk(url):
            video_url, video_attributes = thumbnails.get_video_info(url)
            if video_url:
                add_footer_video_chunk(video_url, video_attributes)
                return

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
              entity_url = e.expanded_url or e.url
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
              else:
                logging.info("Unknown media type: %s", e.type)

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
