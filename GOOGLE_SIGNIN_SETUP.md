# Google Sign-In Setup

This app now has:

- frontend Google sign-in flow wired in JS
- backend Google ID token verification
- backend-issued JWT session after Google login

Before it can work on a real device, finish the platform setup below.

## 1. Create Google OAuth client IDs

Create these in Google Cloud Console:

- Web client ID
- iOS client ID
- Android client configuration for package `com.aline2new`

For Android, register the app signing SHA fingerprints for the build you will test.

## 2. Configure backend

Set in `aline2-app-backend/.env`:

```env
GOOGLE_CLIENT_IDS=your_google_web_client_id.apps.googleusercontent.com
```

If you want to accept multiple clients, use a comma-separated list.

## 3. Configure app env

Set these in the env file you build with, for example `app-aline2/.env.staging`:

```env
GOOGLE_WEB_CLIENT_ID=your_google_web_client_id.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=your_google_ios_client_id.apps.googleusercontent.com
```

## 4. Android requirements

Google Sign-In for Android depends on Google Console configuration matching:

- package name: `com.aline2new`
- signing SHA-1 / SHA-256 for the build

If those do not match, sign-in will fail even if the app compiles.

## 5. iOS requirements

iOS requires the Google URL scheme / app configuration from the iOS OAuth client.

You need to add the reversed iOS client ID URL scheme to `Info.plist` for the iOS app target.

Because that value is specific to your real Google client, it is intentionally not hardcoded in the repo yet.

After updating iOS config, run:

```bash
cd app-aline2/ios
pod install
```

## 6. Rebuild

After setting env vars and native config, rebuild the app:

```bash
cd app-aline2
npm run android:staging
```

or

```bash
cd app-aline2
npm run ios:staging
```

## 7. Backend flow

The app sends a Google ID token to:

```text
POST /auth/google/mobile
```

The backend verifies the token with Google, finds or creates the local user, and returns the normal app JWT/session payload.
