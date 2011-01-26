# Based on get_access_token.py from python-twitter

import sys
import urllib

# parse_qsl moved to urlparse module in v2.6
try:
  from urlparse import parse_qsl
except:
  from cgi import parse_qsl

import oauth2 as oauth
from oauth_keys import SERVICE_PROVIDERS

if len(sys.argv) != 2:
    print "Usage: python get_oauth_access_token.py [googlereader|twitter]"
    exit(1)

service_provider = SERVICE_PROVIDERS.get(sys.argv[1])

oauth_client = oauth.Client(service_provider.consumer)

print 'Requesting temp token'

request_token_body = urllib.urlencode({'oauth_callback': 'oob'})
resp, content = oauth_client.request(
    service_provider.request_token_url, 'POST', body=request_token_body)

if resp['status'] != '200':
  print 'Invalid response requesting temp token: %s\n%s' % (
      resp['status'], content)
else:
  request_token = dict(parse_qsl(content))

  print ''
  print 'Please visit this page and retrieve the pincode to be used'
  print 'in the next step to obtaining an Authentication Token:'
  print ''
  print '%s?oauth_token=%s' % (
      service_provider.authorization_url, request_token['oauth_token'])
  print ''

  pincode = raw_input('Pincode? ')

  token = oauth.Token(request_token['oauth_token'], request_token['oauth_token_secret'])
  token.set_verifier(pincode)

  print ''
  print 'Generating and signing request for an access token'
  print ''

  oauth_client  = oauth.Client(service_provider.consumer, token)
  resp, content = oauth_client.request(
      service_provider.access_token_url,
      method='POST',
      body='oauth_verifier=%s' % pincode)
  access_token  = dict(parse_qsl(content))

  if resp['status'] != '200':
    print 'The request for an access token did not succeed: %s\n%s' % (resp['status'], content)
    print access_token
  else:
    print 'Obtained access token. You can add the following lines in ' \
        'oauth_keys.py:'
    print 'oauth.Token('
    print '    key=\'%s\',' % access_token['oauth_token']
    print '    secret=\'%s\')' % access_token['oauth_token_secret']
