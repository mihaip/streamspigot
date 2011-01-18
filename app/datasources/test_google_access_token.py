import oauth2 as oauth
import google_oauth_keys

reader_oauth_client = oauth.Client(
    oauth.Consumer(
        key=google_oauth_keys.CONSUMER_KEY,
        secret=google_oauth_keys.CONSUMER_SECRET),
    token=oauth.Token(
        key=google_oauth_keys.READER_ACCESS_TOKEN_KEY,
        secret=google_oauth_keys.READER_ACCESS_TOKEN_SECRET))

resp, content = reader_oauth_client.request(
    'http://www.google.com/reader/api/0/user-info', 'GET')

print 'Response: %s' % str(resp)
print 'Content: %s' % str(content)
