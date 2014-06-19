dev:
	@PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python dev_appserver.py --port=8081 app

deploy:
	@PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python appcfg.py --oauth2 update app

twitter-digest-stub-dev:
	dev_appserver.py --port=8082 twitter-digest-stub

twitter-digest-stub-deploy:
	appcfg.py --email=mihai.parparita@gmail.com update twitter-digest-stub
