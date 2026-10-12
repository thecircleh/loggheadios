# Firebase config for push notifications

Codemagic copies these into the generated native projects on every build:

- `GoogleService-Info.plist` — iOS app config (Firebase console → Project settings → Your apps → iOS app, bundle ID `com.loggerheadstat.app`)
- `google-services.json` — Android app config (same place → Android app, package `com.loggerheadstat.app`)

These are client config files, not secrets, and are safe to commit.

The server's service-account key is different: it **is** secret and goes only in the server's
`FIREBASE_SERVICE_ACCOUNT` environment variable — never in this repo.
