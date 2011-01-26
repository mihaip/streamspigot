import sys

from oauth_keys import SERVICE_PROVIDERS

if len(sys.argv) != 2:
    print "Usage: python test_oauth_access_token.py [googlereader|twitter]"
    exit(1)

service_provider = SERVICE_PROVIDERS[sys.argv[1]]
oauth_client = service_provider.get_oauth_client()

resp, content = oauth_client.request(service_provider.test_url, 'GET')
print 'Response: %s' % str(resp)
print 'Content: %s' % str(content)
