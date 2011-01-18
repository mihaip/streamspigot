# Based on get_access_token.py from python-twitter

import urllib

# parse_qsl moved to urlparse module in v2.6
try:
  from urlparse import parse_qsl
except:
  from cgi import parse_qsl

import oauth2 as oauth
import google_oauth_keys

SCOPE = 'http://www.google.com/reader/api/0/'
REQUEST_TOKEN_URL = 'https://www.google.com/accounts/OAuthGetRequestToken?scope=%s' % urllib.quote(SCOPE)
ACCESS_TOKEN_URL = 'https://www.google.com/accounts/OAuthGetAccessToken'
AUTHORIZATION_URL = 'https://www.google.com/accounts/OAuthAuthorizeToken'

signature_method_hmac_sha1 = oauth.SignatureMethod_HMAC_SHA1()
oauth_consumer = oauth.Consumer(
    key=google_oauth_keys.CONSUMER_KEY,
    secret=google_oauth_keys.CONSUMER_SECRET)
oauth_client = oauth.Client(oauth_consumer)

print 'Requesting temp token from Google'

request_token_body = urllib.urlencode({'oauth_callback': 'oob'})
resp, content = oauth_client.request(
    REQUEST_TOKEN_URL, 'POST', body=request_token_body)

if resp['status'] != '200':
  print 'Invalid response from Google requesting temp token: %s\n%s' % (
      resp['status'], content)
else:
  request_token = dict(parse_qsl(content))

  print ''
  print 'Please visit this Google page and retrieve the pincode to be used'
  print 'in the next step to obtaining an Authentication Token:'
  print ''
  print '%s?oauth_token=%s' % (AUTHORIZATION_URL, request_token['oauth_token'])
  print ''

  pincode = raw_input('Pincode? ')

  token = oauth.Token(request_token['oauth_token'], request_token['oauth_token_secret'])
  token.set_verifier(pincode)

  print ''
  print 'Generating and signing request for an access token'
  print ''

  oauth_client  = oauth.Client(oauth_consumer, token)
  resp, content = oauth_client.request(ACCESS_TOKEN_URL, method='POST', body='oauth_verifier=%s' % pincode)
  access_token  = dict(parse_qsl(content))

  if resp['status'] != '200':
    print 'The request for an access token did not succeed: %s\n%s' % (resp['status'], content)
    print access_token
  else:
    print 'Obtained access token. Please update the following two lines in ' \
        'google_oauth_keys.py:'
    print 'READER_ACCESS_TOKEN_KEY = \'%s\'' % access_token['oauth_token']
    print 'READER_ACCESS_TOKEN_SECRET = \'%s\'' % access_token['oauth_token_secret']
