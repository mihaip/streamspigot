dev:
	python2.5 `which dev_appserver.py` --port=8081 app

deploy:
	appcfg.py --email=mihai.parparita@gmail.com update app
