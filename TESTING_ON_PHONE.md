## Phone Testing Handoff

Use this when sharing the app with another developer or tester on a real phone.

### 1. Expose the backend

Run the backend and expose it through ngrok:

```bash
cd aline2-app-backend
npm start
ngrok http 5000
```

Copy the HTTPS forwarding URL, for example:

```text
https://your-api.ngrok-free.app
```

### 2. Configure the backend

Set `CORS_ORIGIN` in `aline2-app-backend/.env` so it includes the public ngrok URL:

```env
CORS_ORIGIN=http://localhost:3000,http://localhost:8081,https://your-api.ngrok-free.app
```

Native mobile apps usually send no `Origin` header, which the backend allows. The ngrok origin is still important for web previews and Socket.IO CORS handling.

### 3. Configure the app staging env

Create `app-aline2/.env.staging` from `app-aline2/.env.staging.example` and set:

```env
API_BASE_URL=https://your-api.ngrok-free.app/api
SOCKET_URL=https://your-api.ngrok-free.app
SHARE_BASE_URL=https://your-api.ngrok-free.app
```

### 4. Build the Android APK

```bash
cd app-aline2
npm run android:staging:apk
```

The APK will be generated under:

```text
app-aline2/android/app/build/outputs/apk/release/app-release.apk
```

### 5. Share with the tester

Send the APK file to the tester. They can install it directly on Android.

### 6. Important notes

- Rebuild the app whenever the ngrok URL changes.
- Keep ngrok running while the tester is using the app.
- If uploads/media are not stored on a public bucket or CDN, media URLs generated from a local machine may not work on another device.
- For iPhone testing, use TestFlight or have the tester build locally with the same `.env.staging`.
