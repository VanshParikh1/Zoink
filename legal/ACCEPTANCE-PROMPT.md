# Implementation prompt — terms acceptance gate

Paste everything below the line into Claude Code from the repo root.

---

Implement terms and privacy acceptance for Zoink. The legal documents already exist at `legal/terms.md` and `legal/privacy.md`. Right now nothing in the app asks the user to accept them and nothing records that they did, which means we have no evidence anyone agreed to anything.

## Where it goes

Acceptance happens **inside registration, before the account is created**. The user fills out `RegisterScreen`, taps Create account, and is taken to a full-screen terms step. Only after they get through that does `register()` fire. This matters: if we create the account first and gate afterwards, we've stored their personal information before they agreed to the policy that says how we'd handle it.

Do not use a checkbox on the registration form alone. A checkbox next to a link, where the document was never put in front of the user, is the weakest form of consent there is. Scroller first, then affirmative action.

## Part 1 — Ship the documents inside the app

Create `packages/shared/legal/`:

- `terms.ts` — exports `TERMS_VERSION = '1.0'` and `TERMS_TEXT` (the full markdown body of `legal/terms.md` as a template literal)
- `privacy.ts` — exports `PRIVACY_VERSION = '1.0'` and `PRIVACY_TEXT`
- `index.ts` — re-exports all four

Bundle them rather than fetching at runtime. Registration must work on a bad campus connection, and the version the user accepted has to be the exact text that shipped in that build, not whatever the server was serving that day.

Add a small script, `packages/shared/scripts/syncLegal.ts`, that regenerates those two files from the markdown in `legal/`, and wire it into the build so the bundled copy can't silently drift from the source of truth. Escape backticks and `${` when generating.

## Part 2 — Schema

Add to `model User` in `backend/prisma/schema.prisma`:

```prisma
termsAcceptedAt     DateTime?
termsVersion        String?
privacyAcceptedAt   DateTime?
privacyVersion      String?
ageAttestedAt       DateTime?
```

Nullable, because existing seeded and test users predate this. Generate a migration; don't edit an applied one.

Also add to `backend/src/config/legal.ts`:

```ts
export const CURRENT_TERMS_VERSION = '1.0'
export const CURRENT_PRIVACY_VERSION = '1.0'
```

Constants, not env vars. These are contract terms — a config change should not be able to alter what a user is recorded as having agreed to.

## Part 3 — Backend

**`backend/src/schemas/auth.schema.ts`** — extend `RegisterSchema.body`:

```ts
acceptedTermsVersion: z.string().min(1),
acceptedPrivacyVersion: z.string().min(1),
ageAttested: z.literal(true, { message: 'You must confirm you are 18 or older.' }),
```

**`backend/src/services/authService.ts`** — `registerUser()` takes the three new arguments. After the existing `isEmailDomainAllowed` check and before creating the user, reject a version mismatch:

```ts
if (acceptedTermsVersion !== CURRENT_TERMS_VERSION ||
    acceptedPrivacyVersion !== CURRENT_PRIVACY_VERSION) {
  throw new BadRequestError('Please update the app to continue — our terms have changed.')
}
```

That check is the point of the whole exercise. It means a stale client cannot register someone against a version of the terms they were never shown.

Stamp all five columns in the `prisma.user.create()` call, with a single `new Date()` captured once so the timestamps match.

**New route** `GET /auth/legal-version`, unauthenticated, returning `{ termsVersion, privacyVersion }`. The client uses it to detect that it's out of date.

**`userController` / `GET /users/me`** — include `termsVersion` and `privacyVersion` in the response so the client can compare.

## Part 4 — The terms screen

New `frontend/src/screens/TermsAcceptanceScreen.tsx`. It takes a mode param: `'register'` or `'update'`.

Requirements:

- Renders `TERMS_TEXT` and `PRIVACY_TEXT` in a scrollable view, in two tabs or two sequential sections. Use a lightweight markdown renderer, or preprocess to styled `<Text>` blocks — do not dump raw markdown syntax at the user.
- Track scroll position via `onScroll`. Until the user reaches the bottom of both documents, the accept button stays disabled and shows "Scroll to continue". Use a ~20px tolerance so it triggers reliably.
- Below the scroller, two separate checkboxes, both unchecked by default, neither pre-selected:
  - "I have read and agree to the Terms of Service and Privacy Policy"
  - "I confirm I am 18 years of age or older"
- The primary button is disabled until both are checked and both documents have been scrolled.
- A visible back/cancel that returns to `RegisterScreen` with the form state intact. Do not make this a trap.
- Show the version and effective date in the footer: "Terms v1.0 · effective {date}".

Style it with the existing `theme` from `src/theme/colors.ts` and the stamped-button treatment already in `RegisterScreen`. It should look like part of the app, not a legal interstitial bolted on.

## Part 5 — Wire up registration

**`RegisterScreen.tsx`** — `handleRegister` currently calls `register(...)` directly. Change it to validate the form as it does now, then `navigation.navigate('TermsAcceptance', { mode: 'register', pendingRegistration: {...} })`. The account is not created here.

**`TermsAcceptanceScreen`** in `'register'` mode calls `register()` with the pending form data plus `TERMS_VERSION`, `PRIVACY_VERSION`, and `ageAttested: true`. Errors surface on this screen; on failure the user goes back to `RegisterScreen` with the message and their data intact.

**`AuthContext.tsx`** — `register()` signature grows the three new arguments and passes them through.

**`navigation/index.tsx`** — add `TermsAcceptance: { mode: 'register' | 'update'; pendingRegistration?: PendingRegistration }` to `RootStackParamList` and register the screen in the unauthenticated stack.

## Part 6 — Re-acceptance gate

`terms.md` §19 promises that a material change gets 30 days' notice plus active acceptance before it applies. That needs a gate for existing users, and building it now is much cheaper than retrofitting it later.

In `navigation/index.tsx`, the root already branches three ways: no user, unverified user, verified user. Add a fourth condition between the verification gate and `VerifiedAppStack`:

```tsx
) : user.termsVersion !== CURRENT_TERMS_VERSION ||
    user.privacyVersion !== CURRENT_PRIVACY_VERSION ? (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen
      name="TermsAcceptance"
      component={TermsAcceptanceScreen}
      initialParams={{ mode: 'update' }}
      options={{ gestureEnabled: false }}
    />
  </Stack.Navigator>
) : (
```

In `'update'` mode the screen shows "We've updated our terms", has no cancel, and on accept calls a new `POST /users/me/accept-terms` that stamps the columns and returns the refreshed user. `gestureEnabled: false` so it can't be swiped away, same treatment as `ReviewPromptScreen`.

## Part 7 — Settings

In `SettingsScreen.tsx`, add a Legal section: links that open `TermsAcceptanceScreen` in a read-only mode (no checkboxes, no button), plus a line reading "Accepted Terms v1.0 on {date}". A user should be able to see what they agreed to without emailing support.

## Part 8 — Tests

Backend, in the style of the existing `authController.test.ts`:

- register with correct versions → 201, all five columns stamped
- register with a stale `acceptedTermsVersion` → 400, **no user row created**
- register with `ageAttested: false` or absent → 400
- `POST /users/me/accept-terms` updates the columns and returns the fresh user
- `GET /auth/legal-version` returns the current constants

Then run `npm run typecheck:frontend` and `npm run test:backend` and make sure both are clean before you're done.

## What not to do

- Don't pre-check the boxes.
- Don't collapse the two checkboxes into one. Age attestation and terms agreement are separate representations and should be recorded separately.
- Don't let the accept button enable before the scroll completes.
- Don't fetch the documents over the network at registration time.
- Don't put the version numbers in env vars.
- Don't skip the re-acceptance gate because nothing needs it yet. It's ten lines now and a migration headache later.
