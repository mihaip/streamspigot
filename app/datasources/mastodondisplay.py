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
    def __init__(self, user, statuses, thumbnail_size, timezone=None):
        self.user = user
        self.statuses = statuses
        self.display_statuses = DisplayStatus.wrap(
            statuses, thumbnail_size, timezone)

    def author_display_name(self):
        return display_name(self.user)

class DisplayStatus(object):
    def __init__(self, status, thumbnail_size, timezone):
        self._status = status
        self._thumbnail_size = thumbnail_size
        self._timezone = timezone

    def status(self):
        return self._status

    def permalink_status(self):
        return self._status.reblog or self._status

    def reblog_display_status(self):
        if self._status.reblog:
            return DisplayStatus(self._status.reblog, self._thumbnail_size, self._timezone)
        return None

    def account_display_name(self):
        return display_name(self._status.account)

    def permalink(self):
        return self.permalink_status().uri

    def created_at_iso(self):
        return self._status.created_at.isoformat()

    def created_at_formatted(self):
        if self._timezone:
            return self._status.created_at.astimezone(
                self._timezone).strftime('%I:%M %p')
        return self._status.created_at.strftime('%I:%M %p GMT')

    def updated_at_iso(self):
        return (self._status.edited_at or self._status.created_at).isoformat()

    def title_as_text(self):
        def truncate(s):
            return s if len(s) < 100 else s[:100] + u'…'

        def get_status_title_text(status):
            if status.spoiler_text:
                return truncate(status.spoiler_text)
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
                    return '[%s: %s]' % (attachment.type, truncate(attachment.description))
                return attachment.type
            return ''

        status = self._status
        if status.reblog:
            title_text = u'↺ %s: %s' % (
                display_name(status.reblog.account),
                get_status_title_text(status.reblog),
            )
            if status.reblog.poll:
                title_text += u' 📊'
        else:
            title_text = get_status_title_text(status)
            if status.poll:
                title_text += u' 📊'

        return u'%s: %s' % (display_name(status.account), title_text)

    def content_as_html(self):
        status = self._status
        escape = xml.sax.saxutils.escape

        html = status.content
        # Replace <p>'s with newlines so that we can avoid leading/trailing
        # margins.
        if html.startswith('<p>') and html.endswith('</p>'):
            html = html[3:-4].replace('</p><p>', '<br><br>')

        if status.poll:
            html += '<table border="1" cellspacing="0" cellpadding="2" style="border-collapse:collapse">'
            html += '<caption style="background:#00000011">Poll</caption>'
            for option in status.poll.options:
                if status.poll.votes_count > 0:
                    percent = 100.0 * option.votes_count / status.poll.votes_count
                else:
                    percent = 0
                html += '<tr><td>%s</td><td>%.2f%%</td></tr>' % (option.title, percent)
            html += '</table>'

        for attachment in status.media_attachments:
            html += '<p>'
            attachment_url = attachment.remote_url or attachment.url
            description = attachment.description or attachment.type
            if attachment.type == 'image':
                html += u' <a href="%s"><img src="%s" alt="%s" class="nnw-nozoom" border=0"/></a>' % (
                    escape(attachment_url),
                    escape(attachment.remote_url or attachment.preview_url),
                    escape(description),
                )
            elif attachment.type == 'video' or (
                    # Fall back to detecting video by file extension if the
                    # type is unknown.
                    attachment.type == 'unknown' and
                    attachment_url and
                    attachment_url.endswith('.mp4')):
                html += u' <video src="%s" poster="%s" alt="%s" />' % (
                    escape(attachment_url),
                    escape(attachment.preview_remote_url or ""),
                    escape(description),
                )
            elif attachment.type == 'gifv':
                html += u' <video src="%s" poster="%s" alt="%s" autoplay loop>' % (
                    escape(attachment_url),
                    escape(attachment.preview_remote_url or ""),
                    escape(description),
                )
            else:
                html += u' <a href="%s">%s</a>' % (
                    escape(attachment_url),
                    escape(description),
                )
            html += '</p>'

        if status.card and status.card.title:
            # Can't use flexbox or real tables due to NetNewsWire style stripping.
            html += '<div style="margin-top:1em;border-radius:4px;border:solid 1px #ccc;">'
            html += '<div style="display:table;width:100%">'
            html += '<div style="display:table-row">'
            if status.card.image:
                html += '<div style="display:table-cell;vertical-align:top;width:128px;padding:2px;"><a href="%s"><img src="%s" alt="%s" class="nnw-nozoom" width="128" border=0" style="border-radius:4px;overflow:hidden;max-width:none"/></a></div>' % (
                    escape(status.card.url),
                    escape(status.card.image),
                    escape(status.card.title),
                )
            html += '<div style="display:table-cell;vertical-align:top;padding:2px;"><a href="%s"><b>%s</b></a><br>%s</div>' % (
                escape(status.card.url),
                escape(status.card.title),
                escape(status.card.description),
            )
            html += '</div>' # row
            html += '</div>' # table
            html += '</div>' # border

        if status.spoiler_text:
            return '<details><summary style="cursor:pointer">%s</summary>%s</details>' % (
                escape(status.spoiler_text), html)

        return html

    def debug_json(self):
        # The Mastodon API client library parses dates as datetime.datetime
        # objects, so we need to force stringification.
        output = json.dumps(self._status, indent=4, default=lambda o: str(o))
        return "\n".join([textwrap.fill(l) for l in output.split("\n")])

    @staticmethod
    def wrap(statuses, thumbnail_size, timezone):
        return [DisplayStatus(s, thumbnail_size, timezone) for s in statuses]

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
