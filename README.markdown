# Introduction

TODO(mihaip)

## Code Organization and Design


### Datasources/API endpoints

Third-party API endpoints are in the `datasources` directory:

* `twitter.py` is the Python wrapper for the Twitter API provided by http://code.google.com/p/python-twitter/ (version 0.8.1 with some small local modifications).
* `googlereader.py` is a simple Python wrapper for the Google Reader "API"
methdos that we need. Some methods require authentication; for now we don't
act on behalf of users, instead the app has a few designated Google accounts
that it stores data it. Authentication is done via OAuth, the access tokens
are stored in `google_oauth_keys.py` (the file is not checked in, but can
be created with the help of `get_google_access_token.py`).
