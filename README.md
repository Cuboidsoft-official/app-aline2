# Aline2 Social App – Project Status

## Project Overview

**Aline2** is a social media mobile application built using React Native for the mobile client and Node.js + Express.js for the backend API.

The application allows users to:

- Create accounts
- Login with OTP verification
- Create posts
- Follow other users
- View feeds
- Receive notifications
- Search users and profiles

The project is structured with separate client and backend services to ensure scalability and maintainability.

---

# Project Architecture

## Mobile Client

Built using React Native with TypeScript.

### Client Structure

```
src
 ├── api
 │   └── api.js
 │
 ├── navigation
 │   └── BottomTabs.js
 │
 └── screens
     ├── CreatePostScreen.tsx
     ├── FeedScreen.tsx
     ├── FollowersFollowingScreen.tsx
     ├── HomeScreen.tsx
     ├── LoginScreen.tsx
     ├── NotificationScreen.tsx
     ├── OtpVerifyScreen.tsx
     ├── ProfilePreviewScreen.tsx
     ├── ProfileScreen.tsx
     ├── ProfileView.tsx
     ├── SearchScreen.tsx
     └── SignupScreen.tsx
```

### Implemented Client Features

| Feature | Status |
|-------|-------|
User Authentication UI | Completed |
OTP Verification Screen | Completed |
Home Feed UI | Completed |
Search Users Screen | Completed |
Profile Screen | Completed |
Followers / Following UI | Completed |
Create Post Screen | Completed |
Notifications Screen | Completed |
Bottom Tab Navigation | Completed |
API Integration | In Progress |

---

# Backend API

Backend built with:

- Node.js
- Express.js
- MongoDB
- Mongoose

### Backend Structure

```
aline2-backend
 ├── config
 ├── controllers
 │   ├── authController.js
 │   ├── commentController.js
 │   ├── followController.js
 │   ├── likeController.js
 │   ├── notificationController.js
 │   └── postController.js
 │
 ├── middleware
 │
 ├── models
 │   ├── User.js
 │   ├── Profile.js
 │   ├── Post.js
 │   ├── Comment.js
 │   ├── Like.js
 │   ├── Follow.js
 │   └── Notification.js
 │
 ├── routes
 │   ├── authRoutes.js
 │   ├── commentRoutes.js
 │   ├── followRoutes.js
 │   ├── likeRoutes.js
 │   ├── notificationRoutes.js
 │   ├── postRoutes.js
 │   └── userRoutes.js
 │
 ├── utils
 │   └── createNotification.js
 │
 └── server.js
```

---

# Implemented Backend Features

| Feature | Status |
|------|------|
User Authentication API | Completed |
JWT Authentication | Completed |
Post API | Completed |
Comments API | Completed |
Like System | Completed |
Follow System | Completed |
Notifications System | Completed |
Real-time Notifications | In Progress |
Email / OTP Verification | In Progress |

---

# Tech Stack

## Mobile
- React Native
- TypeScript
- React Navigation
- Axios

## Backend
- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication
- Socket.IO

---

# Current Development Status

| Module | Status |
|------|------|
UI Development | Completed |
Backend APIs | Completed |
API Integration | In Progress |
Testing | Pending |
Deployment | Pending |

Overall Project Completion: **~75%**

---

# Next Development Steps

1. Complete API integration between mobile app and backend
2. Implement real-time notifications using Socket.IO
3. Optimize feed loading and caching
4. Perform end-to-end testing
5. Prepare production build and deployment

---

# Running the Project

## Client

```
npm install
npm start
npm run android
```

## Shareable Android APK via GitHub Actions

This repo includes a GitHub Actions workflow at [`.github/workflows/android-apk.yml`](/workspaces/app-aline2/.github/workflows/android-apk.yml) that builds a release APK and uploads it for download.

Use it like this:

1. Push the latest code to GitHub.
2. Open the repository `Actions` tab.
3. Run `Build Android APK`.
4. Choose the env file:
   `.env` uses the current Codespaces backend.
   `.env.staging` uses the staging-style config.
5. Leave `publish_release` enabled if you want a GitHub Release download page.
6. Wait for the workflow to finish.
7. Open the workflow run summary and use either:
   the uploaded artifact link, or
   the `Download APK via GitHub Release` link.

Notes:

- The local path `android/app/build/outputs/apk/release/app-release.apk` only exists after a successful Android release build.
- If you have not built locally or in CI yet, that folder/file will not be present.
- GitHub Actions builds the APK on the runner, then uploads it as a downloadable artifact or release asset.
- If the repository is private, teammates will need repo access to download Actions artifacts or release assets.
- The APK is built against the selected env file, so backend switching should happen through `.env`, `.env.staging`, or `.env.production` rather than code edits.

## Backend

```
npm install
npm start
```

---

# Notes

- UI and backend logic are mostly completed.
- Remaining work includes API integration, real-time features, and testing.
- The system is designed to scale and support additional features in the future.
