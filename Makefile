dev:
	@PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python /usr/local/bin/dev_appserver.py --port=8081 app

deploy:
	@PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python /usr/local/bin/appcfg.py --oauth2 update app

twitter-digest-stub-dev:
	@PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python /usr/local/bin/dev_appserver.py --port=8082 twitter-digest-stub

twitter-digest-stub-deploy:
	@PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python /usr/local/bin/appcfg.py --oauth2 update twitter-digest-stub
