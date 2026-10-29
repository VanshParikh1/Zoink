# Android checks on Windows: handoff

Everything the hardening run (Phases 4 and 5) couldn't check because this Mac runs no Android emulator. Each check has exact steps and what to expect. iOS was checked on the iPhone 17 Pro simulator (`docs/hardening-log.md`, Phase 4 and Phase 5 sections). Accessibility (Phase 6, TalkBack and font scale) hasn't started; its Android checks will be added when it does.

## 1. Get the branch onto the Windows machine

The branch `quality/hardening` is only on the Mac (not pushed). Either:

- **Push it** from the Mac (`git push -u origin quality/hardening`; the GitHub repo is public), then on Windows `git clone https://github.com/VanshParikh1/Zoink.git` and `git switch quality/hardening`; or
- **Carry a bundle**, no push: on the Mac `git bundle create zoink-hardening.bundle quality/hardening`, copy the file over, then on Windows `git clone zoink-hardening.bundle Zoink -b quality/hardening`.

## 2. One-time setup on Windows

1. **Node 22.12 or newer** (the repo's `engines`; the Mac runs 25.9), Git, and **JDK 17** (Android Studio's bundled JBR works: set `JAVA_HOME` to it).
2. **Android Studio** with an SDK (API 35 or 36), platform-tools and an emulator (Pixel 8, Google Play image, API 35+). Set `ANDROID_HOME` (usually `%LOCALAPPDATA%\Android\Sdk`) and add `%ANDROID_HOME%\platform-tools` to `PATH`. Check: `adb devices` lists the running emulator.
3. **Copy these files from the Mac by hand** (they hold keys; they're git-ignored, never commit them):
   - `frontend/.env` (API URL, Stripe publishable key, MapTiler key, Sentry DSN)
   - `frontend/google-services.json` (Firebase config the Android build needs)
   - `backend/.env.test`, only if you run the bench API on Windows (option B below)
4. Install and build the shared package, from the repo root:
   ```powershell
   npm install
   npm run build:shared
   ```

## 3. An API for the emulator

The checks use the seeded bench API (Stripe mocked, about 450 listings, a 500-message chat). Accounts: `renter1@mail.utoronto.ca` and `owner2@mail.utoronto.ca`, password `BenchPass123!` (from `backend/src/scripts/bench/seed.ts`).

- **Option A, bench on the Mac** (simplest; both machines on the same network). On the Mac: `cd backend && PORT=3000 npx ts-node src/scripts/bench/serve.ts --seed` (allow incoming connections if macOS asks). On Windows the API URL is `http://<Mac's LAN IP>:3000` (Mac: System Settings › Wi-Fi › Details). A VPN or the Cisco posture agent on the Mac can block this; use option B if so.
- **Option B, bench on Windows.** Install PostgreSQL 16, create databases `zoink_test` and `zoink_bench`, put `backend/.env.test` in place (its `DATABASE_URL` names `zoink_test`; the bench swaps in `zoink_bench`), then:
  ```powershell
  cd backend
  $env:DATABASE_URL = "postgresql://USER:PASSWORD@localhost:5432/zoink_bench"
  npx prisma migrate deploy
  Remove-Item Env:DATABASE_URL
  $env:PORT = "3000"; npx ts-node src/scripts/bench/serve.ts --seed
  ```
  Then `adb reverse tcp:3000 tcp:3000`, and the API URL is `http://localhost:3000`.

Ids for the link checks (run against `zoink_bench` wherever it lives; they change with every `--seed`):

```sql
-- a live listing renter1 doesn't own
SELECT l.id FROM listings l JOIN users u ON u.id = l."ownerId"
WHERE u.email <> 'renter1@mail.utoronto.ca' AND l."deletedAt" IS NULL AND l."isAvailable" LIMIT 1;
-- soft-delete one for the "no longer available" check (bench data only)
UPDATE listings SET "deletedAt" = now(), "isAvailable" = false
WHERE id = (SELECT l.id FROM listings l JOIN users u ON u.id = l."ownerId"
            WHERE u.email <> 'renter1@mail.utoronto.ca' AND l."deletedAt" IS NULL ORDER BY l."createdAt" LIMIT 1)
RETURNING id;
-- renter1's latest booking, someone else's booking, renter1's chat with the 500 messages
SELECT b.id FROM bookings b JOIN users u ON u.id = b."renterId" WHERE u.email = 'renter1@mail.utoronto.ca' ORDER BY b."updatedAt" DESC LIMIT 1;
SELECT b.id FROM bookings b JOIN users r ON r.id = b."renterId" JOIN users o ON o.id = b."ownerId"
WHERE r.email <> 'renter1@mail.utoronto.ca' AND o.email <> 'renter1@mail.utoronto.ca' LIMIT 1;
SELECT c.id FROM conversations c JOIN users u ON u.id = c."renterId" WHERE u.email = 'renter1@mail.utoronto.ca' LIMIT 1;
```

## 4. Build and run the release app

```powershell
cd frontend
$env:EXPO_PUBLIC_API_URL = "http://localhost:3000"   # or http://<Mac IP>:3000 for option A
$env:EXPO_PUBLIC_DEMO_MODE = "false"
$env:EXPO_PUBLIC_PERF_LOG = "1"     # [perf] lines in logcat
$env:EXPO_PUBLIC_QA_TOOLS = "1"     # zoink://qa/... switches below; leave out of store builds
$env:EXPO_NO_METRO_WORKSPACE_ROOT = "1"   # Windows only, see below
npx expo run:android --variant release
```

On Windows (found 2026-10-29), three things stop that from working as written:

- **Bundling fails** with `Unable to resolve module ./index.ts from D:\Zoink/.`. On Windows the React Native Gradle plugin passes the entry file relative to `frontend/`, and Expo resolves it from the monorepo root. `EXPO_NO_METRO_WORKSPACE_ROOT=1` (above) keeps Metro's root at `frontend/`; `metro.config.js` still resolves packages from the root `node_modules`.
- **The app crashed at launch** (`undefined is not a function` in `@sentry/browser/.../feedbackAsync.js`) until `metro.config.js` stubbed Sentry's feedback wrappers itself: Sentry's resolver looks for `@sentry/browser` in a path that has backslashes on Windows.
- **No requests reach `http://localhost:3000`**: release builds block cleartext HTTP (only `src/debug/AndroidManifest.xml` allows it), so every call is `[api] … → no answer`. For a QA build, add `android:usesCleartextTraffic="true"` to `<application>` in the generated `android/app/src/main/AndroidManifest.xml` (git-ignored; a prebuild regenerates it) and rebuild. The iOS simulator allows `localhost`, which is why this didn't show there.

The emulator only needs x86_64: `cd android; .\gradlew.bat app:assembleRelease -PreactNativeArchitectures=x86_64`, then `adb install -r app\build\outputs\apk\release\app-release.apk`, cuts the first native build to about a quarter.

Useful while checking:

```powershell
adb logcat | Select-String "\[perf\]|\[api\]|\[stripe\]"          # app log lines
adb shell am start -W -a android.intent.action.VIEW -d "zoink://listing/<id>" com.zoink.app   # open a link
adb shell am force-stop com.zoink.app                              # for cold starts
```

QA switches (QA builds only): `zoink://qa/offline/on`, `zoink://qa/offline/off`, `zoink://qa/offline/device` (force offline, force online, back to the real state); `zoink://qa/crash/root`, `zoink://qa/crash/tab`, `zoink://qa/crash/screen` (the next render at that level throws once). Open them with the `adb shell am start … -d "<url>"` line above.

## 5. Checklist

Write the result next to each (pass, or what happened).

### From Phase 4 (performance)

1. **Grid without blank cells** (`removeClippedSubviews`, Home and My listings): fling fast down and back up through 150+ listings. Expect no blank cells, no missing photos, no missing "Rented out" badges after scrolling back.
2. **Grid scroll frames**: 10 fast flings each way on Home; read the `[perf] scroll home-grid … dropped=` lines. Expect 0 most of the time (iOS: 0–2, 16 of 20 at 0).
   - **Result (Windows emulator, 2026-10-29): not met.** 20 flings: dropped 2–45 per fling, about 15 typical, jsFps 41–59; none at 0. Pixel 8 API 35 emulator on an i7-7700K, so this needs a real phone before it counts.
3. **Release cold start**: `adb shell am force-stop com.zoink.app`, then `adb shell am start -W -n com.zoink.app/.MainActivity` ten times; note `TotalTime` and the `[perf] startup main-app` / `home-content` lines.
   - **Result (emulator): TotalTime 3145–4180 ms** over ten runs (3490, 3493, 3145, 3476, 3543, 4180, 4123, 4059, 3950, 4078). Every `[perf] startup` line prints `n/a`: `performance.rnStartupTiming.startTime` isn't set on this Android runtime, so `perfMarks.ts` has no start to measure from. Use `TotalTime` on Android.
4. **Splash** (Android 12+): it stays until the first screen and fades into it, with no white frame. Record with `adb shell screenrecord /sdcard/splash.mp4`, then `adb pull /sdcard/splash.mp4`.
5. **Photos on Glide**: WebP photos show in the grid, rows, listing hero and avatars; a recycled grid cell never shows the previous listing's photo; memory stays flat over a long scroll (Android Studio › Profiler).
6. **Chat history**: open renter1's 500-message chat, scroll up to the first message (older pages load without the list jumping), then send from up there: the list lands on the new message.
7. **HTTP client on OkHttp**: sign in; a wrong password shows "Invalid email or password."; upload a listing photo, a handoff photo and an avatar; a session the server ends (stop the API, delete renter1's account from another device, or wait out a short token) signs out once.
   - **Result: partial.** Sign-in and the wrong-password message pass (`[api] POST /auth/login → 401: Invalid email or password.`). Uploads and the server-ended session not checked yet.
8. **Pull-to-refresh** on Home, Search results, My listings, Rentals, Requests, Inbox and the admin lists: the app's colours, it goes back to page one, and a light haptic tick when the pull triggers (with Touch feedback on, see 14).
9. **Polling only while focused**: on Zoink It, press Home, and check in logcat (or the API's log) that the 3-second booking poll stops, and resumes when the app comes back.

### From Phase 5 (reliability and UX)

10. **Airplane mode, for real** (the iOS simulator can't do this; the QA switch stood in for it):
    1. Signed in, on Home, swipe down the quick settings and turn on **Airplane mode**. Expect, within a second or two, a yellow bar at the top: "You're offline. Nothing will send until you reconnect." Nothing under it is covered.
    2. Open Bookings (not opened before): "You're offline. Your rentals will load when you're back online." with Try again.
    3. Open a chat, type a message, send: "Not sent: tap to retry / You're offline, so this wasn't sent…"; the text stays in the box.
    4. Turn Airplane mode off: the bar goes, a "You're back online." toast shows, Bookings loads by itself, and tapping "Not sent: tap to retry" sends the message.
    5. Repeat 1 and 4 with only Wi-Fi off on the emulator's network (Extended controls › Cellular › Data status: Denied, Wi-Fi off).
11. **Server unreachable** (not offline): stop the bench API, open Requests: "Couldn't load your requests. Couldn't reach Zoink. Check your connection and try again." Start it again and tap Try again: it loads.
    - **Result: pass.** Exact message shown; after restarting the API, Try again loaded Requests ("No pending action right now").
12. **Links**, with the ids from section 3 (`adb shell am start -W -a android.intent.action.VIEW -d "<url>" com.zoink.app`):
    - warm: `zoink://listing/<live id>` opens the listing over Home; hardware Back and the on-screen Back both return to Home.
    - soft-deleted: `zoink://listing/<deleted id>`: "This listing is no longer available." with Go to Home.
    - someone else's booking: `zoink://booking/<other id>`: "This booking isn't available."
    - unknown: `zoink://profile/x`: "Link not found".
    - cold: `adb shell am force-stop com.zoink.app`, then `zoink://chat/<chat id>`: the app starts on that chat; Back goes to Home.
    - signed out: sign out, open `zoink://booking/<renter1's id>`: the login screen shows; sign in as renter1: the booking opens straight after.
    - **Result: pass, all six.** Warm listing opens over Home and both Backs return to Home; soft-deleted, foreign booking and unknown show their messages with Go to Home; cold chat link starts on renter1's chat with owner User2 and Back goes to Home; signed-out booking link shows login, then opens the booking ("Waiting for the owner.") right after sign-in.
13. **Notification taps** (the emulator needs a Google Play image; sign in as owner2 on the emulator so its push token registers, then from another device or the API act as renter1): send owner2 a message → tap the notification with the app closed, then in the background, then in the foreground: the chat opens each time. Request one of owner2's listings → the notification opens that booking. Back goes to where you were (or Home after a cold start).
14. **Haptics follow the system setting**: Settings › Sound & vibration › Vibration & haptics › **Touch feedback** off: sending a request, accepting or declining (owner2), sending a message, pull-to-refresh and switching tabs give no vibration. Turn it on: light ticks on each, a firmer one on "+" and Zoink It. (Emulators don't vibrate; this needs a real Android phone. Mark it "device needed" if you only have the emulator.)
15. **Keyboard never covers the submit button** (`softwareKeyboardLayoutMode: resize`): focus the last field of each form and check the submit button is visible above the keyboard: Login, Register, Verify email, List an item, Edit listing, Request to rent (message), Report a problem, Report a user/listing, Review, Profile › Edit (Save), admin dispute notes, chat composer.
16. **Fields**: on Login and Register the email keyboard has `@`, nothing auto-capitalises or autocorrects ("utoronto" stays as typed), Google autofill offers the email and password; Register's name fields offer given/family name; phone opens the phone pad; listing prices open a decimal pad.
17. **Messages don't move the form**: submit Login and Register empty: each field gets its message underneath, and nothing below moves. Listing form: price row messages fit their two reserved lines.
18. **Double taps**: tap Sign in, Send (chat), Request, Report and List it twice as fast as you can: one request each (check the `[api]` lines and the bench API's log; one listing, one message).
19. **Toasts over modals**: on Android toasts don't get iOS's separate window. Open someone's profile (it's a modal), block them: the "is blocked" toast should be visible; if it's hidden under the modal, note it. Also: the university picker on Register.
20. **Error boundaries and hardware Back**: `zoink://qa/crash/tab`: "This tab hit a problem." with the tab bar still working; Try again restores it. Open a listing, then `zoink://qa/crash/screen`: "This screen hit a problem." with Go back and Try again; also press **hardware Back** on that screen: it leaves the screen. `zoink://qa/crash/root`: "Something broke."; Try again restores the app.
    - **Result: fail (tab and root Try again).** Screen level passes: "This screen hit a problem." with Go back working, and hardware Back leaves the screen. Tab level: the message shows and the tab bar works (switching away and back restores the tab), but **Try again does nothing**. Root level: "Something broke." shows, but **Try again does nothing** and logs nothing. The next unrelated re-render (e.g. `zoink://qa/offline/on`) draws Home again, but after that **no tap anywhere reaches JS** until the app is restarted; links and hardware Back still work. Logcat at the crash: "There was an error during concurrent rendering but React was able to recover by instead synchronously rendering the entire root" (stack: Probe → ErrorBoundary → OfflineFrame). Repro: fresh launch, check a tab tap works, `zoink://qa/crash/root`, tap Try again.
21. **Confirmations**: Cancel booking (Booking detail) and Decline (owner2, Requests and Booking detail) ask first; "Keep booking" / "Keep request" leaves everything as it was.
22. **Updated terms way out** (needs a user on an older terms version; skip if you can't set one up): "Not now, sign out" signs out.
