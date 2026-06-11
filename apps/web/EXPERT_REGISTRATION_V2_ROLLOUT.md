# Expert Registration v2 Rollout Checklist

## Feature Flag
- Add `NEXT_PUBLIC_EXPERT_REGISTRATION_V2=true` in non-prod first.
- Verify `/expert-registration` opens wizard modal by default.
- Verify "Enter my details manually" reveals manual input page and keeps same state.

## API + DB Validation
- Apply migration `supabase/v2/015_expert_registration_v2.sql`.
- Verify `expert_profiles` row is auto-created on first `GET /api/experts/registration-draft`.
- Verify `profile_visibility_state` is `expert_pending_admin_review` during registration.
- Verify `POST /api/experts/registration-submit` blocks if required fields are missing.
- Verify submit sets `users.has_expert_profile=true` and `users.convene_role_mode=expert`.

## AI Generators
- Set `OPENAI_API_KEY`.
- Verify endpoints:
  - `POST /api/expert-registration/generate/bio`
  - `POST /api/expert-registration/generate/services`
  - `POST /api/expert-registration/generate/skills`
  - `POST /api/expert-registration/generate/booking-preferences`

## Payment Bypass Admin Toggle
- Load admin page footer settings.
- Toggle "Allow DEV payment bypass".
- Confirm non-prod Stripe PI routes respect DB toggle:
  - `/api/stripe/create-payment-intent`
  - `/api/stripe/create-freelance-payment-intent`

## Manual QA
- Wizard step progression saves draft on Continue.
- Manual + wizard share same values for all fields.
- "Other" category sends suggestion to `user_feedback`.
- Weekly availability sample slot persists in draft.

## Cutover
- Keep legacy `/api/experts/onboard` consumers untouched during transition.
- Switch CTAs fully to `/expert-registration`/`/become-expert` v2 flow after QA sign-off.
