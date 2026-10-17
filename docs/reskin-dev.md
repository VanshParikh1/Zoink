# Reskin dev notes

## Running the reskin locally

### 1. Turn demo mode on (no backend needed)

Demo mode runs the whole app on the mock services in `frontend/src/services/mock*.ts`. In demo mode `services/api.ts` refuses every real HTTP request. If anything slips past the mocks, Metro logs `Demo mode blocked a backend request: …` and the request fails.

`frontend/.env.local` sets `EXPO_PUBLIC_DEMO_MODE=false`. Leave that file alone and add a local override instead:

```bash
printf 'EXPO_PUBLIC_DEMO_MODE=true\n' > frontend/.env.development.local
```

To turn demo mode off again, delete that file:

```bash
rm frontend/.env.development.local
```

The file is gitignored (`frontend/.gitignore`: `.env*.local`).

**Why not `EXPO_PUBLIC_DEMO_MODE=true npx expo start`?** That doesn't work in development builds. Expo's dev-only env module (`node_modules/@expo/metro-config/build/transform-worker/transform-worker.js`) builds the env as `{ ...process.env, ...the .env files }`, so `.env.local` overrides a shell variable. `EXPO_NO_DOTENV=1` doesn't change that module either. The files are merged in the order `.env` → `.env.development` → `.env.local` → `.env.development.local`, so `.env.development.local` wins. Production exports (`expo export`, EAS builds) inline the values instead, and there a shell variable does win.

**Do env changes need a Metro cache clear?** In development, no. A fresh `npx expo start` picked up the new `.env.development.local` without `--clear` (checked by fetching the dev bundle). Restart Metro after adding or removing the file. Use `--clear` when an env change has to reach a production export, or after changing `frontend/.svgrrc`, because SVG transforms are cached.

### 2. Start Metro and the iOS dev build

```bash
cd frontend
npx expo start --dev-client
```

Then press `i`, or open `exp+zoink://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081` on the simulator.

If the installed dev build is older than the native dependencies (for example `Cannot find native module 'ExpoUpdates'`), rebuild it. CocoaPods needs a UTF-8 locale:

```bash
cd frontend
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios --no-bundler
```

### 3. Sign in and walk the app (demo data)

1. On Login, enter any email and password and tap **Sign in**. If the keyboard is still open, the first tap only dismisses it; tap again.
   - In demo mode nothing is sent anywhere. `login()` stores the local demo token and signs you in as the demo user (Mihir Mistry).
   - If a demo session is already stored, the app skips Login and signs you straight in.
2. Two required reviews open first: "Review Jordan", then "Review Aisha". Pick any rating in each row (and the item stars on the first one), then tap **Submit review**. The mock store lives in memory, so they come back after every full reload.
3. **Home:** nearby listings. Tap a card to open the listing detail.
4. **Rentals:** Home → **Bookings** (or Profile → **My bookings**). Tap an active rental to see return status, the deposit and **Chat**.
5. **Messages:** the **Inbox** tab has four seeded conversations.
6. **Settings:** **Profile** tab → scroll → **Settings**.
7. **Design gallery:** at the bottom of Settings, **Design gallery (dev)**. This only exists in `__DEV__` builds.

Checked on the iPhone 17 Pro simulator (iOS 26.5) on 2026-10-17: every step above worked, and the demo-mode guard logged no blocked requests.

### 4. Stored-session recovery

If the stored token can't be decoded, launch now deletes it, logs `Stored session token could not be decoded; clearing it` and continues signed out. Before, it surfaced "Failed to load token". One way to get such a token is a demo token left in SecureStore after turning demo mode off.

### 5. Android (not set up yet)

Android setup is blocked: this Mac has about 7 GB free, and the SDK, emulator, an API 35 system image, the emulator's data and Gradle caches need roughly 10–15 GB. Free up space first, then:

```bash
brew install --cask zulu@17
```

```bash
brew install --cask android-commandlinetools
```

Add these lines to `~/.zprofile`:

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
```

Then, in a new shell:

```bash
sdkmanager --licenses
```

```bash
sdkmanager "platform-tools" "emulator" "platforms;android-35" "build-tools;35.0.0" "system-images;android-35;google_apis;arm64-v8a"
```

```bash
avdmanager create avd -n Pixel_8_API_35 -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_8
```

```bash
cd frontend && npx expo run:android
```

Gradle for React Native 0.81 needs JDK 17. The JDKs installed now (OpenJDK 23, Corretto 22) are newer than it supports.
