dev:
	@PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python dev_appserver.py --port=8081 app

deploy:
	gcloud app deploy --project streamspigot-hrd app/app.yaml

twitter-digest-stub-dev:
	@PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python dev_appserver.py --port=8082 twitter-digest-stub

twitter-digest-stub-deploy:
	@PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python /usr/local/bin/appcfg.py update twitter-digest-stub
