# Tingle — Android app

Native Kotlin + Jetpack Compose client. Talks to the same backend
(`services/api`) as the web app, over the same REST endpoints and the
same `/ws/signal` WebSocket signaling protocol — `signaling/SignalMessages.kt`
mirrors `packages/types` exactly.

## Prerequisites

- Android Studio (Jellyfish or newer) or a standalone JDK 17 + Android SDK
  (API 34) with command-line tools
- The backend running locally: `docker compose up` from the repo root

## One-time setup: Gradle wrapper

This checkout includes `gradle/wrapper/gradle-wrapper.properties` (pins
Gradle 8.7) but **not** the wrapper jar itself, since generating it needs
network access this environment didn't have. Before building, run once,
from `apps/mobile/`:

```bash
gradle wrapper --gradle-version 8.7
```

(requires *some* local Gradle install just for this one command — or
simply open the project in Android Studio, which generates the wrapper
automatically on first sync). After that, `./gradlew` works normally for
everything below.

## Pointing at the backend

`app/build.gradle.kts` hardcodes the dev default:

```kotlin
buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000\"")
buildConfigField("String", "WS_BASE_URL", "\"ws://10.0.2.2:4000\"")
```

`10.0.2.2` is the Android **emulator's** alias for your host machine's
`localhost` — it is not a typo and won't work as-is on a physical device.
For a physical device on the same network as your `docker compose up`
host, override both at build time:

```bash
./gradlew assembleDebug \
  -PapiBaseUrl=http://192.168.1.23:4000 \
  -PwsBaseUrl=ws://192.168.1.23:4000
```

(Wire `-P` properties into `buildConfigField` in `app/build.gradle.kts` if
you use this often — left as a straightforward follow-up since the
emulator default covers most local development.)

`network_security_config.xml` only permits plaintext HTTP/WS to
`10.0.2.2` and `localhost`. Any other host must be HTTPS/WSS — for a real
deployment, delete the cleartext `domain-config` block entirely.

## Running

```bash
./gradlew installDebug
```

or just hit Run in Android Studio with an emulator (API 26+) or a
physical device with USB debugging enabled.

## Building for release

```bash
./gradlew assembleRelease    # -> app/build/outputs/apk/release/app-release.apk
./gradlew bundleRelease      # -> app/build/outputs/bundle/release/app-release.aab
```

Release builds are signed from `apps/mobile/keystore.properties`, which is
gitignored and **does not exist yet** — generate a keystore and create it
yourself:

```bash
keytool -genkey -v -keystore tingle-release.keystore \
  -alias tingle -keyalg RSA -keysize 2048 -validity 10000
```

Then create `apps/mobile/keystore.properties`:

```properties
storeFile=../tingle-release.keystore
storePassword=<your store password>
keyAlias=tingle
keyPassword=<your key password>
```

Never commit the keystore file or this properties file — both are covered
by `.gitignore` already.

## What's real vs. placeholder in this pass

- **Real**: auth flow, matchmaking/signaling over the actual WebSocket
  protocol, live WebRTC audio/video via `org.webrtc` (Google's official
  prebuilt library — BSD-3, free, no paid SDK), permission handling that
  falls back to voice-only if camera is denied rather than blocking the
  call entirely (spec section 39), a foreground service so the call
  survives briefly backgrounding the app.
- **Placeholder**: the launcher icon is a simple two-circle vector mark,
  not final brand art. Email verification's "resend" flow assumes you
  read the token out of the API container's dev-mode console log
  (`docker compose logs -f api`) the same way the web app does — there's
  no deep-link handling yet for opening a `tingle://verify-email?token=…`
  link directly from the email.

## Not yet covered

No automated tests for this app (the API test suite in `services/api/tests/`
is the one place in this repo with real coverage). Instrumented UI tests
(Espresso/Compose testing) and a WebRTC integration test against a live
signaling server would be the next additions here.
