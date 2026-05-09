import datetime
import json
import logging
import urlparse

from datasources import thumbnails, twitterappengine, twitterdisplay
import session

class BackupHandler(session.SessionApiHandler):
    def _get_signed_in(self):
        content = self.request.get('content')
        format = self.request.get('format')

        def fetch_statuses(fetcher):
            statuses = []
            status_ids = set()
            max_id = None
            max_time= None
            for i in range(1, 100):
                chunk_statuses = fetcher(max_id)
                had_new_statuses = False
                for status in chunk_statuses:
                    if status.id in status_ids:
                        continue
                    statuses.append(status)
                    status_ids.add(status.id)
                    if max_time is None or status.created_at_in_seconds < max_time:
                        max_time = status.created_at_in_seconds
                        max_id = status.id
                    had_new_statuses = True
                if not had_new_statuses:
                    break
            return statuses

        if content == 'tweets':
            statuses = fetch_statuses(lambda max_id: self._api.GetUserTimeline(count=200, max_id=max_id, contributor_details=True))
        elif content == 'likes':
            statuses = fetch_statuses(lambda max_id: self._api.GetFavorites(count=200, max_id=max_id))
        else:
            logging.warning("unknown content type: %s", content)
            self._write_error(400)
            return

        if format == "json":
            self.response.headers['Content-Disposition'] = 'attachment; filename="%s.json"' % content
            self.response.headers['Content-Type'] = 'application/json'
            self.response.out.write(json.dumps([s.original_json_dict for s in statuses], indent=4))
        elif format in {"atom", "html"}:
            self.response.headers['Content-Disposition'] = 'attachment; filename="%s.%s"' % (
                content, "xml" if format == "atom" else "html")

            twitter_user = self._api.GetUser(self._session.twitter_id)
            timezone = twitterdisplay.get_timezone_for_auth_user(self._caching_api)

            # We don't actually want statuses grouped, instead we want one status
            # per item.
            status_groups = [
                twitterdisplay.DisplayStatusGroup(
                    user=status.user,
                    statuses=[status],
                    thumbnail_size=thumbnails.LARGE_THUMBNAIL,
                    timezone=timezone)
                for status in statuses
            ]

            request_url = urlparse.urlparse(self.request.url)

            if format == "html":
                json_url = '%s://%s%s?content=%s&format=json' % (
                        request_url.scheme, request_url.netloc, self._get_path('backup'), content)

                self._write_template('birdfeeder/backup.html', {
                    'subtitle': '@%s\'s %s' % (twitter_user.screen_name, content),
                    'status_groups': status_groups,
                    'json_url': json_url,
                }, content_type='text/html')
            else:
                feed_url = '%s://%s%s?content=%s&format=atom' % (
                        request_url.scheme, request_url.netloc, self._get_path('backup'), content)
                html_url = '%s://%s%s?content=%s&format=html' % (
                        request_url.scheme, request_url.netloc, self._get_path('backup'), content)

                self._write_template('birdfeeder/backup.atom', {
                    'subtitle': '@%s\'s %s' % (twitter_user.screen_name, content),
                    'backup_date_iso': datetime.datetime.utcnow().isoformat(),
                    'status_groups': status_groups,
                    'feed_url': feed_url,
                    'html_url': html_url,
                }, content_type='application/atom+xml')
        else:
            logging.warning("unknown format type: %s", format)
            self._write_error(400)
            return

    def _get_signed_out(self):
        self._write_error(403)
