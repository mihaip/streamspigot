# Introduction

Stream Spigot a collection of tools to make consumption of real time-ish datasources more manageable. For now two tools have been built:
* Tweet Digest lets tweets be consumed in daily digests (ideally via a feed reader). This is useful for high-volume accounts that would be annoying to follow directly. Digests can be defined either with explicit lists of usernames or by using the built-in Twitter list functionality.
* Feed Playback allows RSS/Atom feed content to be played back (Google Reader is used for historical data). This makes it easy to read a newly-discovered blog from the beginning in a manageable fashion.

A running instance is at [www.streamspigot.com](http://www.streamspigot.com/).

## Code Organization and Design

The various tools (tweet digest, feed playback, etc.) are pretty distinct. Parallel directories are maintained in `app` and `app/templates` (e.g. `app/tweetdigest` and `app/templates/tweetdigest`). Within each tools the convention is to have a `handlers.py` with all the HTTP request handlers and a `data.py` with all the business logic (non-tool specific API bindings go into `datasources`, see below for more).

Base/utility code goes in `app/base` and `app/templates/base`.

UI JavaScript is minimal, and is composed of a few modules in `app/static`.

The tweet digest component of the app was formerly known as Twitter Digest and used to run at `twitter-digest.appspot.com`. A small "stub" App Engine app that redirects requests from there to `www.streamspigot.com/tweet-digest` is in `twitter-digest-stub`.

### Datasources/API endpoints

Third-party API endpoints are in the `datasources` directory:

* `twitter.py` is the Python wrapper for the Twitter API provided by http://code.google.com/p/python-twitter/ (version 0.8.1 with some small local modifications). It uses authentication even for requests for publicly-visible data so that we don't get rate-limited as often.
* `googlereader.py` is a simple Python wrapper for the Google Reader "API"
methdos that we need. Some methods require authentication; for now we don't
act on behalf of users, instead the app has a few designated Google accounts
that it stores data it.

For both Twitter and Google Reader, authentication is done via OAuth, the access tokens are stored in `oauth_keys.py` (the file is not checked in, but can
be created based on the `oauth_keys.py.template` file with the help of `get_oauth_access_token.py` and tested with `test_oauth_access_token.py`).

### Helper scripts

The top-level `Makefile` file has a couple of helper commands, `dev` to run with the App Engine development server and `deploy` to deploy the app to production.
