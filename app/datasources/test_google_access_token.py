import oauth2 as oauth
import google_oauth_keys

oauth_consumer = oauth.Consumer(
    key=google_oauth_keys.CONSUMER_KEY,
    secret=google_oauth_keys.CONSUMER_SECRET)

oauth_client = oauth.Client(
    oauth_consumer, token=google_oauth_keys.READER_ACCESS_TOKEN)

resp, content = oauth_client.request(
    'http://www.google.com/reader/api/0/user-info', 'GET')

print 'Response: %s' % str(resp)
print 'Content: %s' % str(content)
