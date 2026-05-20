# Meta App Setup Guide

## 1. Create a Meta App

1. Go to https://developers.facebook.com/apps/
2. Click **Create App**
3. Select **Business** type
4. Fill in app name (e.g. "ai-lichiditate") and contact email
5. Click **Create App**

## 2. Add Products

In your app dashboard, add these products:
- **Facebook Login** — for OAuth flow
- **Instagram Graph API** — for Instagram data

## 3. Configure Facebook Login

Under Facebook Login → Settings:
- Add to **Valid OAuth Redirect URIs**: `http://localhost:3000/auth/callback/meta` (dev) and your production URL
- Enable **Client OAuth Login** and **Web OAuth Login**

## 4. Configure Permissions

Under App Review → Permissions and Features, request:
- `instagram_basic`
- `instagram_manage_insights`
- `pages_show_list`
- `pages_read_engagement`
- `business_management`

**Development mode:** All permissions work without App Review for app admins/testers. You can add test users under Roles → Test Users.

**Production:** You must submit for App Review to use these permissions with accounts that are not app admins. The review process requires a privacy policy URL, use case descriptions, and screen recordings.

## 5. Get Your App Credentials

Under App Settings → Basic:
- Copy **App ID** → `META_APP_ID`
- Copy **App Secret** (click Show) → `META_APP_SECRET`

## 6. Set Environment Variables

```env
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_GRAPH_API_VERSION=v21.0
META_REDIRECT_URI=http://localhost:3000/auth/callback/meta
```

## 7. Requirements for Testing

Your Instagram account must be:
- A **Business** or **Creator** account (not Personal)
- Connected to a **Facebook Page**
- Added as an admin/tester to your Meta app

## 8. API Version

This integration uses Graph API `v21.0`. Meta deprecates old versions ~2 years after release. Check https://developers.facebook.com/docs/graph-api/changelog for the latest version and update `META_GRAPH_API_VERSION` accordingly.
