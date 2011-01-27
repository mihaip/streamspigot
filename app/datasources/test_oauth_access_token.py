import sys

from oauth_keys import SERVICE_PROVIDERS

if len(sys.argv) != 2:
    print "Usage: python test_oauth_access_token.py [googlereader|twitter]"
    exit(1)

service_provider = SERVICE_PROVIDERS[sys.argv[1]]
for i in xrange(0, len(service_provider.access_tokens)):
    oauth_client = service_provider.get_oauth_client(token_index=i)
    resp, content = oauth_client.request(service_provider.test_url, 'GET')
    print 'Token %d' % i
    print '    Response: %s' % str(resp)
    print '    Content: %s' % str(content)
