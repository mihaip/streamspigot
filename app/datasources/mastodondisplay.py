# coding: utf-8

from HTMLParser import HTMLParser
import itertools
import json
import logging
import textwrap
import xml.sax.saxutils

from base.constants import CONSTANTS
import base.util

class DisplayStatusGroup(object):
    def __init__(self, user, statuses, thumbnail_size):
        self.user = user
        self.statuses = statuses
        self.display_statuses = DisplayStatus.wrap(
            statuses, thumbnail_size)
        self.status_pairs = itertools.izip(self.statuses, self.display_statuses)

    def author_display_name(self):
        return display_name(self.user)

class DisplayStatus(object):
    def __init__(self, status, thumbnail_size):
        self._status = status
        self._thumbnail_size = thumbnail_size

    def permalink_status(self):
        return self._status.reblog or self._status

    def permalink(self):
        return self.permalink_status().uri

    def created_at_iso(self):
        return self._status.created_at.isoformat()

    def created_at_formatted(self):
        return self._status.created_at.strftime('%I:%M %p GMT')

    def updated_at_iso(self):
        return (self._status.edited_at or self._status.created_at).isoformat()

    def title_as_text(self):
        def truncate(s):
            return s if len(s) < 100 else s[:100] + u'…'

        def get_status_title_text(status):
            if status.get('text'):
                return truncate(status.text)
            parser = ContentToTitleTextParser()
            parser.feed(status.content)
            text = truncate(parser.text())
            if text:
                return text
            if status.media_attachments:
                attachment = status.media_attachments[0]
                if attachment.description:
                    return '[%s: %s]' % (attachment.type, attachment.description)
                return attachment.type
            return ''

        status = self._status
        if status.reblog:
            title_text = u'↺ %s: %s' % (
                display_name(status.reblog.account),
                get_status_title_text(status.reblog),
            )
        else:
            title_text = get_status_title_text(status)

        return u'%s: %s' % (display_name(status.account), title_text)

    def body_as_html(self):
        escape = xml.sax.saxutils.escape

        def get_status_html(status):
            html = status.content
            # Replace <p>'s with newlines so that we can avoid leading/trailing
            # margins.
            if html.startswith('<p>') and html.endswith('</p>'):
                html = html[3:-4].replace('</p><p>', '<br><br>')

            for attachment in status.media_attachments:
                html += '<p>'
                if attachment.type == 'image':
                    html += u' <a href="%s"><img src="%s" alt="%s" class="nnw-nozoom" border=0" /></a>' % (
                        escape(attachment.url),
                        escape(attachment.preview_url),
                        escape(attachment.description or attachment.type),
                    )
                elif attachment.type == 'video':
                    html += u' <video src="%s" alt="%s" />' % (
                        escape(attachment.url),
                        escape(attachment.description or attachment.type),
                    )
                elif attachment.type == 'gifv':
                    html += u' <video src="%s" alt="%s" autoplay loop>' % (
                        escape(attachment.url),
                        escape(attachment.description or attachment.type),
                    )
                else:
                    html += u' <a href="%s">%s</a>' % (
                        escape(attachment.url),
                        escape(attachment.description or attachment.type),
                    )
                html += '</p>'
            return html

        status = self._status
        if status.reblog:
            return u'<div style="opacity:0.5;margin-bottom:0.5em">↺ boosted <a href="%s" style="color: %s">%s</a></div>' % (
                escape(status.reblog.account.url),
                CONSTANTS.USER_LINK_COLOR,
                escape(display_name(status.reblog.account)),
            ) + get_status_html(status.reblog)

        return get_status_html(status)

    def debug_json(self):
        # The Mastodon API client library parses dates as datetime.datetime
        # objects, so we need to force stringification.
        output = json.dumps(self._status, indent=4, default=lambda o: str(o))
        return "\n".join([textwrap.fill(l) for l in output.split("\n")])

    @staticmethod
    def wrap(statuses, thumbnail_size):
        return [DisplayStatus(s, thumbnail_size) for s in statuses]

# Gets only the first line of content as plain text.
class ContentToTitleTextParser(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self)
        self._text = []
        self._done = False

    def handle_data(self, data):
        if self._done:
            return
        self._text.append(data)

    def handle_endtag(self, tag):
        if tag == 'p':
            self._done = True

    def text(self):
        return ''.join(self._text).strip()

def display_name(user):
    if user.display_name:
        display_name = user.display_name
        if ':' in display_name and user.emojis:
            for emoji in user.emojis:
                display_name = display_name.replace(
                    ':%s:' % emoji.shortcode,
                    '')
        return display_name
    return user.username
