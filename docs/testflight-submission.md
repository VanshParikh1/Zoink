# TestFlight submission drafts

Drafts only: nothing here has been submitted. The paste-ready copy (Beta App Description, What to Test, reviewer Notes, App Store metadata) is in `docs/store/testflight-info.md`, written with the launch-prep changes (15% commission, deposit rules, pickup payment check). The parts you fill in on App Store Connect are below.

## TestFlight › Test Information

| Field | Value |
| --- | --- |
| Beta App Description | `docs/store/testflight-info.md` › "Beta App Description" |
| Feedback Email | `zoinksupport@gmail.com` |
| What to Test | `docs/store/testflight-info.md` › "What to Test" |
| Marketing URL | https://zoinkit.app |
| Privacy Policy URL | https://zoinkit.app/privacy.html |
| Support URL (App Store) | https://zoinkit.app/support.html (new; live once `main` deploys on Vercel) |

"What to Test" says the build uses Stripe **test** mode (card 4242…). That stays true only while `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` on EAS (production env) and `STRIPE_SECRET_KEY` on Railway are test keys. If you switch either to live keys before testers use this build, change that paragraph.

## App Review sign-in

**Correction to the brief:** sign-in is **not** OTP-only. `POST /auth/login` takes email + password (`LoginSchema`, `backend/src/schemas/auth.schema.ts`). The 6-digit code is only asked for once, to verify a new account. So the reviewer needs an account that is already verified, not a way past the code on every sign-in.

| Option | What it needs in code | Tradeoffs |
| --- | --- | --- |
| **A. Seeded, pre-verified reviewer account** (recommended) | Nothing: `backend/src/scripts/seedReviewerAccount.ts` exists and is covered by `seedReviewerAccount.integration.test.ts`. You run it against production with `REVIEWER_PASSWORD` and `--confirm-remote` | No special path in production auth. The seeded "ready to pay" booking starts the next day (the deposit pay window), so seed it on the day you submit and again if review runs past ~2 days. The reviewer sees real data on the real backend |
| B. Fixed code for one allowlisted email | `verifyOTP` / `resendOTP` accept a fixed code when the email is in a server-only env allowlist (e.g. `REVIEW_OTP_EMAILS`); never on by default; tests that it's off without the env var | Lets the reviewer go through sign-up themselves. It is a backdoor in production auth, and it's only needed if Apple insists on testing sign-up. Doesn't help with sign-in, which never asks for a code |
| C. Demo mode in the store build | Remove the `__DEV__` gate in `frontend/src/config/demoModeGate.ts` and add a hidden way to turn it on | Not recommended: the reviewer would see mock data, not the real app, which Apple can reject under 2.1. Puts a mock-data path into the shipped build |

App Review Information: user name `reviewer@zoink.app`, password = the `REVIEWER_PASSWORD` you seed with, Notes from `docs/store/testflight-info.md` › "Notes for the reviewer". Nothing in A needs implementing. B and C wait for your pick.
