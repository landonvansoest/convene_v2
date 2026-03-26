# V1 -> V2 Database Mapping (Editable)

**Purpose:** This document maps the *legacy v1 database / data model* to the *v2 database contract in `docs/bible/convene_bible_032526.rtf`*. It exists **only** to support **optional one-time data migration** from v1 into a net-new v2 database.

**Authority (non-negotiable):**
- **`docs/bible/convene_bible_032526.rtf` always takes precedence** over this document.
- **V2 naming** (tables, columns, enums) is defined by the Bible. This file may mention **v1** names as *sources*; targets must match the Bible exactly.
- **This mapping document does not define app logic**, UI behavior, RLS, or how the product should work after cutover. Implement the app against the Bible + schema; use this doc only when copying old rows.
- If a v1 field cannot be converted to the Bible’s format or would **force incorrect lifecycle/state** in v2, **do not import that field’s value** (omit, NULL, or recompute per Bible). **Losing v1 data is acceptable** (pre-launch rebuild).

**Scope / rules you set:**
- The v2 Supabase DB is created from the **Bible** (and migrations derived from it), not from this doc.
- Existing repo v1 fields, RLS, and settings have **no bearing** on v2 schema.
- This doc is for **data remapping** only (what to import, how to transform, and what is intentionally dropped).

## Source of truth
- **V2 schema contract:** `docs/bible/convene_bible_032526.rtf` (Bible DB structure section + stated behavior rules).
- **V1 “what existed”** (for migration scripts only):
  - Historical app usage patterns in `src/lib/supabaseSync.ts` and other queries.
  - Legacy migration scripts in `supabase/*.sql` (where present).

## Terminology
- **V1** = current app database model and current table/column names.
- **V2** = new database model strictly matching the Bible (`docs/bible/convene_bible_032526.rtf`).

## Consistent mapping format (edit this doc)
For each V2 table below:
1. **V2 Columns / constraints** (as specified in the Bible).
2. **V1 source(s)** (table + column(s) that can populate it).
3. **Transform rules** (format conversions, derived values, join/view logic).
4. **Import status**
   - `importable` = can be populated from v1 data
   - `derived` = compute from v1 values (or from v1 + v1)
   - `new_no_v1_source` = exists in v2 but no direct v1 source; must be filled/left NULL
   - `not_represented` = present in v1 but has no v2 destination (it will be dropped or archived)
5. **Open items / TODO** = items that need your confirmation.

---

## Global decisions (confirmed)
These affect many per-table mappings.

1. **V2 boolean vs “yes/no” wording**
   - Bible uses “yes/no” wording in fields. In SQL, we should implement as `boolean` (recommended) or as `text`.  
   - Decision: Yes, implement as SQL `boolean` everywhere the Bible says “yes/no”.

2. **Primary keys + ID strategy in the Bible**
   - Some Bible “Table: X” sections list only `user_id` without explicitly stating the PK.  
   - Decision (recommended best option):
     - For tables where the Bible explicitly names an `*_id` (e.g. `message_id`, `conversation_id`, `booking_id`), use that as the table primary key.
     - For one-to-one profile tables where the Bible effectively keys by `user_id` (e.g. `expert_profiles`, `expert_availability`), use `user_id` as the primary key (and keep it unique).
     - For tracking/join tables where the Bible uses a `unique(A, B)` constraint (e.g. `seen_requests`), use a composite primary key `(A, B)` to match the uniqueness rule.

3. **Requests (public / community) — v1 legacy table names**
   - The product concept is **requests** (learners post; experts respond). v1 split this across legacy tables:
     - **`questions`**, **`question_notifications`**, **`question_responses`**
     - **`user_posts`**, **`post_responses`**, **`seen_posts`**, **`archived_posts`**
   - Bible v2 canonical model is **`requests`**, **`request_responses`**, **`seen_requests`**, **`archived_requests`**, etc.
   - Decision: Do not migrate any v1 request-board data. v2 `requests*` starts empty and is created fresh going forward.

4. **`users.online` vs “Available now” (separate concepts)**
   - **`users.online`**: true “online / presence” for the Online Now badge only. **Do not** map from v1 `online_available`. Set `users.online = false` on import; v2 runtime/presence updates it.
   - **“Available now” (experts only)**: driven **only** by expert availability rules (e.g. v2 `expert_availability.available_now` / schedule + product logic). **Do not migrate** v1 `online_available` into `users.online`. Re-implement the v1 bypass behavior inside the v2 “available now” feature, not as global user presence.

5. **Bookable time representation (`bookings`)**
   - **`start_time` and `end_time`**: both are **time-of-day** values (aligned with the Bible + UTC display contract: stored canonically, shown in viewer timezone).
   - **`duration`**: per Bible (e.g. derived from `start_time`/`end_time` or stored explicitly). Do **not** treat `end_time` as “duration in minutes”; that was old wording, not the target model.

6. **`bookings.status` (migration vs v2 lifecycle)**
   - **Do not import** v1 `bookings.status` (v1 values like `pending` / `confirmed` / `cancelled` do not map cleanly onto v2 `upcoming | live | complete` without changing product semantics).
   - **If** you run a historical import from v1: set **`status = 'complete'`** for **every** migrated booking row (owner decision: all historical imports treated as complete).
   - In normal v2 operation, **`live`** is runtime/session-time behavior per Bible; do not backfill `live` from v1.

7. **Reviews & requests: Bible table names only**
   - V2 targets: **`reviews_of_experts`**, **`reviews_of_learners`**, **`requests`**, **`request_responses`**, **`seen_requests`**, **`archived_requests`** (and related Bible tables).
   - v1 **review** legacy tables: **`expert_reviews`**, **`learner_reviews`**. v1 **request** legacy tables: **`user_posts`**, **`post_responses`**, **`seen_posts`**, **`archived_posts`**, **`questions`**, **`question_notifications`**, **`question_responses`** — **legacy sources only** if you choose to migrate; they are **not** v2 table names.

8. **Expert aggregates (`review_count`, `cancellation_rate`)**
   - **Not stored in v2** as first-class migrated columns (derived-only / computed in app or from source tables). Do not import v1 denormalized aggregates into v2 `expert_profiles` unless the Bible explicitly adds a cached column and you intend to maintain it.

9. **Review rating column names**
   - Use the **exact** knowledge-related rating column name from the Bible (e.g. after Bible fix: `knowledgeable_rating`). **Do not** invent alternate spellings in migration scripts.

10. **Expert profile `expert_status` at import vs v1 approval**
   - **Import rule:** set **`expert_status = 'temp'`** for every migrated expert row (clean v2 slate unless you intentionally script otherwise).
   - **Semantic reference** (when interpreting v1 `is_approved` for one-off scripts or manual fixes): v1 **approved** → v2 **`active`**; v1 **pending / not approved** → v2 **`pending`**. **`temp`** is v2-only (new lifecycle).
   - **Profile visibility** (hidden/pending/reasons) remains the Bible’s visibility state machine where specified; do not collapse it into `expert_status` unless the Bible explicitly ties them.

11. **Offers / packages schema completeness in the Bible**
   - Bible explicitly lists tables for `freelance_work`, `expert_packages`, `learner_package_credits`, `package_credit_redemptions`, `discount_redemptions`.
   - Bible text mentions an `offers` (or `booking_offers`) and `offer_usages` table, but I did **not** see an explicit “Table: offers” definition in the extracted DB structure region.
   - Decision: Do not migrate/import v1 data for any offer/package/credits/discount concepts:
     - `freelance_work`, `expert_packages`, `learner_package_credits`, `package_credit_redemptions`, `discount_redemptions`
   - v2 offer-related tables will be created but start empty (populated only going forward).

---

## Table: `users` (V2)
### V2 columns (Bible)
- `user_id`
- `first_name`
- `last_name`
- `full_name` (derived from `first_name` + `last_name`)
- `email_address`
- `email_verified` (yes/no)
- `password` *(Bible field name; v1 stores `password_hash`)*
- `profile_photo`
- `phone_number`
- `hometown`
- `time_zone` *(derived from `hometown` per Bible / geocoding; **do not** copy from v1 timezone columns)*
- `language`
- `profession`
- `introduction`
- `birthday`
- `gender`
- `has_expert_profile` (yes/no) *(Bible mentions it as a column; could be derived)*
- `created_at`
- `updated_at`
- `sessions_booked`
- `learner_dependability_rating`
- `online` (yes/no; powers Online Now badge)

### V1 source candidates
- Table: `users` (repo)
  - `id` -> `user_id`
  - `email` -> `email_address`
  - `password_hash` -> `password` 
  - `profile_photo` / `profile_photo_url` -> `profile_photo`
  - `phone` / `phone_number` -> `phone_number`
  - `hometown` -> `hometown`
  - v1 `time_zone` / `timezone` (any column) -> **do not import** into v2 `time_zone`. Compute v2 `time_zone` from imported **`hometown`** using the Bible’s updated format (e.g. Places/geocoding pipeline), not from legacy v1 timezone strings.
  - `language` / `preferred_language` -> `language`
  - `profession` / 'professional_title' -> `profession`
  - `introduction` / `about` -> `introduction`
  - `birthday`, `gender` -> matching fields
  - `user_type` + presence of `expert_profiles` row -> `has_expert_profile`
  - `email_confirmed_at` / `email_verified` logic -> `email_verified`
  - `online` -> v1 likely **does not persist runtime online state** (likely new_no_v1_source)

### Import status
- `importable`: ids, name/email/photo/profile fields (except any missing columns)
- `derived`: `full_name`, `has_expert_profile` (likely), **`time_zone`** (from `hometown` only)
- `new_no_v1_source`: `online` (runtime state)
- `not_represented / risky`: `password` import (recommendation below)

### Important TODO / recommendation
**Password import is usually not feasible/safe.**
- If you are building a new Supabase project, you likely can’t carry over v1 password hashes into v2 auth seamlessly.
- **Default approach:** import user profile data but **do not import password hashes**; rely on Supabase Auth and password reset / re-enrollment.

### v1 duplicate user tables (if present)
- Some v1 dumps include both **`users`** and **`users with name`** (or similarly split tables). Merge into a single v2 **`users`** row per person.
- **Precedence:** where both rows exist for the same identity, **prefer `users with name` fields** on overlap (then fill gaps from `users`), unless a future Bible note specifies otherwise.
- **`time_zone` / `timezone`:** never take precedence from either v1 table — always **derive from `hometown`** per Bible.

---

## Table: `expert_profiles` (V2)
### V2 columns (Bible)
- `user_id` (FK to `users.user_id`; “not user-editable”)
- `full_name` (derived)
- `expert_status` (`active` / `pending` / `temp`) *(Bible)* — see **Global decision #10** (import: all `temp`; reference mapping from v1 `is_approved` when needed)
- `experience_level`
- `category_id` (FK to `categories.category_id`)
- `qualifications`
- `expert_bio`
- `about_services`
- `skills_specializations`
- `is_verified` (yes/no; “admin override for badge”)
- `expert_dependability_rating`
- *(any other columns exactly as `docs/bible/convene_bible_032526.rtf` lists — e.g. `expert_profile_id`, `complete_sessions` if present)*

**Not migrated as denormalized aggregates (derived-only):** v1 `review_count`, `cancellation_rate`, and similar counters — recompute from source data in v2; do not copy legacy aggregate columns unless the Bible explicitly defines a maintained cache.

### V1 source candidates
- Table: `expert_profiles` (repo)
  - `user_id` -> `user_id`

  - `experience_level` -> `experience_level`
  - `category` (string) -> `category_id` (**after** seeding `categories` and matching name → row)
  - `area_of_expertise` + skills merging -> `skills_specializations` — **Recommendation:** implement as **`TEXT[]`** in v2 (best for search filters, “one badge per tag”, and admin/AI tag limits). If the Bible text still says “string”, treat that as *human wording* and align the Bible to `TEXT[]` (or store ordered tags and render as badges in UI).
  - `qualifications` / `education` / `certifications` -> `qualifications`
  - `bio` -> `expert_bio`
  - `about_services` -> `about_services`
  - `is_verified` -> `is_verified`
- dependability is computed in v2 (not imported as a “final” persisted value from v1):
  - In v2, recompute `expert_dependability_rating` using the Bible dependability algorithm:
    - per booking, apply only one deduction bucket per party using priority: cancellation -> reschedule attempt -> late-join/no-join
      (reschedule attempt bucket applies when the user created the `reschedule_request` / `time_suggestion` message for that booking, regardless of accepted/declined)
    - late-join/no-join “100” deduction applies only when there is no cancellation and no reschedule attempt
    - use deterministic timestamp sources: `bookings.cancelled_at`, `messages.created_at` for the user’s reschedule/time-suggestion attempt, and joined timestamps (`bookings.expert_joined` / `bookings.learner_joined`) to compute join delay
    - roll up as an integer percent (rounded) across completed/rescheduled/cancelled bookings for that expert
  - **Do not import** v1 booking-level `learner_score` / `expert_score` (or similar) as authoritative v2 dependability fields; **recompute** per Bible from timestamps / messages after import.

### Import status
- `importable`: most profile content fields
- `derived`: `full_name`
- `new_no_v1_source` (or needs compute): `expert_dependability_rating` depending on where v1 persists it

### Decisions (owner-confirmed)

1. **Category: what “`category_id` (FK)” means** (plain language)  
   - v1: category is a **string** on the expert (e.g. `"Marketing"`).  
   - v2: category is a **pointer** (`category_id`) to a row in **`categories`** (that row holds `name`, `icon`, `is_active`, etc.).  
   - **Import:** create/fill `categories` first, then set each expert’s `category_id` by matching the old string to `categories.name` (or a manual map).

2. **`skills_specializations` — recommendation for search + badges**  
   - **Use `TEXT[]`** in Postgres: one array element = one tag = one badge; easy `ANY()` / GIN indexing for search.  
   - If the Bible still says “string”, **update the Bible** to say `TEXT[]` (or “array of tags”) so schema and UI stay aligned.

3. **`expert_status` vs v1 `is_approved`**  
   - **Import:** set **every** migrated expert to **`temp`** (unless you intentionally run a different script).  
   - **Reference mapping** when reading v1: **approved → `active`**, **pending / not approved → `pending`**. **`temp`** is v2-only.

---

## Table: `user_subscriptions` (V2)
### V2 columns (Bible)
- `subscription_id`
- `user_id`
- `stripe_customer_id`
- `stripe_subscription_id`
- `plan_id`
- `status`
- `current_period_start`, `current_period_end`
- `cancel_at_period_end`
- `created_at`, `updated_at`

### V1 source candidates
- Table: `user_subscriptions` (repo)
  - likely exists because backend stripe webhook updates it
  - Map exact columns by name where possible

### Import status
- `importable` (likely)

### TODO
- Confirm v1 column names for:
  - `stripe_customer_id` vs `customer_id`
  - `plan_id`

---

## Table: `expert_availability` (V2)
### V2 columns (Bible)
- `user_id`
- `full_name` (derived)
- `rate`
- `weekly_schedule`
- `availability_overrides` (JSONB)
- `available_now` (yes/no)
- `available_until` *(owner: **time-of-day**, **computed** from product rules / schedule — not a raw v1 column copy)*
- `online` (yes/no)
- `minimum_booking`, `maximum_booking` *(owner: **`maximum_booking` = max session length as hours + minutes**, not “max days advance”)*
- `minimum_notice`, `maximum_notice` *(advance-booking window per Bible; import from v1 only when convertible — see **expert_availability** decisions)*
- `buffer_time`
- `auto_accept`
- `extend_sessions`
- `allow_messaging`
- `discount_first`
- `offer_package`

### V1 source candidates
- Table: `expert_availability` (repo migrations)
  - `user_id`
  - `hourly_rate` -> `rate`
  - `weekly_schedule` -> `weekly_schedule`
  - `date_overrides` -> `availability_overrides` (name mismatch only)
  - `min_notice_minutes` -> `minimum_notice` *(only if convertible to Bible notice options; else do not import)*
  - `max_days_advance` -> **`maximum_notice`** *(only if convertible; **not** `maximum_booking`; if no clean mapping, omit and use v2 default)*
  - `buffer_time`, `auto_accept` -> matching
  - **`online_available` → do not migrate** (not analogous to `users.online` or to “available now” alone; re-implement bypass inside v2 “Available now” behavior)
  - v2 `expert_availability.online`: **not** sourced from v1 `online_available`; treat as **separate** product field if still in Bible, or align Bible so expert table does not overload “online” with availability bypass

### Import status
- `importable`: schedule + core booking preference fields
- `new_no_v1_source` (or compute): fields like `extend_sessions`, `allow_messaging`, `offer_package` if they are not persisted in v1 `expert_availability`.

### Decisions (owner-confirmed)

- **“Available now”** = derived from **expert availability / schedule** only. **`users.online`** = **presence** only. **`v1.online_available`** = **do not migrate**; rebuild its behavior under v2 “Available now” rules.  
- **`maximum_booking`:** max bookable **duration**, expressed as **hours + minutes** (not days-in-advance).  
- **`available_until`:** **time-of-day**, **computed** (e.g. end of “available now” window), not a direct v1 import field.  
- **`maximum_notice`:** map from v1 only when v1 values convert cleanly to the Bible’s allowed notice windows; if not convertible, **do not import** (use v2 default). *(v1 `max_days_advance` is not always equivalent — do not force a bad mapping.)*

---

## Table: `bookings` (V2)
### V2 columns (Bible)
- `booking_id`
- `expert_user_id`
- `expert_full_name` (derived)
- `learner_full_name` (derived)
- `session_date`
- `start_time` (time-of-day; Bible UTC + viewer-timezone display rules apply)
- `end_time` (time-of-day; **not** “duration in minutes”)
- *(if modeled separately)* `duration_minutes` or derive duration from `session_date` + `start_time` + `end_time`
- `rate`
- `discount_applied`
- Monetary breakdown per Bible (e.g. `booking_amount`, `platform_fee`, `taxes_fees`, `total_amount`, `total_charge` — **use exact names from `docs/bible/convene_bible_032526.rtf`**)
- `extensions` (number of 15 min add-ons) — **v2 feature; no v1 data**
- `extensions_amount`
- `status` (upcoming/live/complete)
- `payment_status`
- `meeting_room_url`
- `daily_room_id`
- `created_at`, `updated_at`
- `cancelled_at`, `cancelled_by`, `cancellation_reason`
- `expert_joined`, `learner_joined`
- `expert_delay`, `learner_delay`
- `expert_dependability`, `learner_dependability`
- `pending_reschedule_date`, `pending_reschedule_start_time`, `pending_reschedule_end_time`
- `reschedule_request_id` (FK to `messages.message_id`)
- `chat_transcript` / `session_transcript`

### V1 source candidates
- Table: `bookings` (repo)
  - `id` -> `booking_id`
  - v1 `expert_id` / `learner_id` often reference **profile rows** or mixed ids — **resolve to `users.user_id`** and store as **`expert_user_id`** / **`learner_user_id`**. Using **two explicitly named columns** on `bookings` is standard; not a problem (preferred for clarity and FKs to `users`).
  - `session_date` -> same
  - `start_time`, `end_time` -> same (**time-of-day**; see **Global decision #5**)
  - `duration` (v1 minutes): keep as **separate** duration metric — import if v2 column exists, else **derive** from end−start on `session_date`
  - `hourly_rate` -> `rate` *(if v1 is hourly and v2 is per 15 min, apply Bible conversion e.g. ÷ 4 with your rounding rule)*
  - `discount_applied` -> same semantics where compatible
  - `total_amount` -> **do not import** if v2 computes totals from `booking_amount`, fees, taxes, extensions per Bible (recompute on import or leave to app defaults)
  - `status` -> **do not import** from v1 (see **Global decision #6 — `bookings.status`**). On historical import: set **`complete`** for every row.
  - `payment_status` -> map only if v2 enum/strings match; otherwise omit or default per Bible
  - `meeting_room_url` -> `meeting_room_url` (if Bible column exists)
  - v1 `daily_room_name` -> v2 `daily_room_id` **only** if you have a deterministic mapping (lookup table / API id). If not, leave **`daily_room_id` NULL** (historical video links may be unrecoverable — acceptable per rebuild policy).
  - `cancelled_at`, `cancellation_reason` -> same
  - Per-booking dependability columns (if present in Bible: e.g. `expert_dependability`, `learner_dependability`): **recompute** after import; **do not** treat v1 scores as source of truth.
  - Evidence for recomputation (import when available):
    - v1 stores `learner_score`, `expert_score`, plus cancellation + join timestamps; v2 should recompute from timestamps (not trust derived v1 score columns):
      - cancellation lead-time uses `bookings.cancelled_at`
      - reschedule attempt lead-time uses the corresponding reschedule/time-suggestion `messages.created_at` for the user on that booking
      - late-join/no-join delay is computed from joined timestamps (`bookings.learner_joined` / `bookings.expert_joined`) vs scheduled start (ignore precomputed v1 delay fields except as a fallback)
    - map join timestamps:
      - `learner_joined_at` -> `learner_joined`
      - `expert_joined_at` -> `expert_joined`
    - map cancellation timestamps:
      - `cancelled_at` -> `cancelled_at`
  - reschedule:
    - `pending_reschedule_date`, `pending_reschedule_start_time`, `pending_reschedule_end_time` -> matching Bible columns
    - `reschedule_request_id` -> matches (FK to messages)

### Import status
- `importable`: all core fields + reschedule fields
- `derived/new`: transcripts; **`extensions` / `extensions_amount` → `new_no_v1_source`** (no v1 data; default 0 / NULL).

### Decisions (owner-confirmed)

- **Extensions:** new in v2; **do not import** from v1 — set **`extensions = 0`** (and amounts 0 / NULL) unless you add a column later.  
- **`status`:** **do not migrate** v1 booking status values (avoids breaking v2 lifecycle logic). **Historical import rule:** set **`status = 'complete'`** for all migrated rows. Normal v2 operation uses **`upcoming` / `live` / `complete`** per Bible without inferring from v1.

---

## Table: `freelance_work` (V2)
### V2 columns (Bible)
- `freelance_id`
- `status` (offered/approved/complete)
- `expert_user_id`
- `learner_user_id`
- `duration`
- `description_of_work`
- `deadline`
- `rate`
- `total_price`
- `payment_status`
- `created_at`, `updated_at`

### V1 source candidates
- v1 likely does not have a dedicated `freelance_work` table.
- v1 may represent offers via:
  - `messages.metadata` fields (when send-offer is implemented)
  - or may store “prep/review” only in UI and not persist (depends on current stage)

### Import status
- `new_no_v1_source` / excluded from v1 import (per **Global decision #11**: do not map any offer data).

### TODO / question
- (intentionally skipped) offers import excluded.

---

## Table: `expert_packages` (V2)
### V2 columns (Bible)
- `package_id`
- `expert_user_id`
- `label`
- `session_count`
- `session_duration_minutes`
- `total_price`
- `status` (active/archived)
- `created_at`, `updated_at`

### V1 source candidates
- v1 UI has package configuration but current code indicates it may be skipped/saved in-memory only.
- Likely no v1 table exists.

### Import status
- `new_no_v1_source` / excluded from v1 import (per **Global decision #11**).

---

## Table: `learner_package_credits` (V2)
### V2 columns (Bible)
- `credit_id`
- `package_id`
- `learner_user_id`
- `remaining_credits`
- `granted_at`
- `expiration_at` (1 year from purchase/grant by default)
- `created_at`, `updated_at`

### V1 source candidates
- v1 likely no persisted credits table.

### Import status
- `new_no_v1_source` / excluded from v1 import (per **Global decision #11**).

---

## Table: `package_credit_redemptions` (V2)
### V2 columns (Bible)
- `redemption_id`
- `credit_id`
- `booking_id`
- `credits_used`
- `created_at`

### V1 source candidates
- v1 likely no table; depends on whether packages/credits exist.

### Import status
- `new_no_v1_source` / excluded from v1 import (per **Global decision #11**).

---

## Table: `discount_redemptions` (V2)
### V2 columns (Bible)
- `redemption_id`
- `expert_user_id`
- `learner_user_id`
- `booking_id`
- `used_at`
- unique(expert_user_id, learner_user_id)

### V1 source candidates
- v1 has `bookings.first_session_discount` logic at least in code (`first_session_discount` stored in expert availability or expert profiles in earlier schema).
- v1 may not have explicit “redemption” row tracking.

### Import status
- `new_no_v1_source` / excluded from v1 import (per **Global decision #11**).

### TODO / question
- (intentionally skipped) offers/discount redemptions import excluded.

---

## Table: `conversations` (V2)
### V2 columns (Bible)
- `conversation_id`
- `expert_user_id`
- `expert_full_name` (derived)
- `learner_user_id`
- `learner_full_name` (derived)
- `created_at`, `updated_at`
- `last_message_at`
- unique(learner_user_id, expert_user_id)

### V1 source candidates
- v1 table: `conversations`
  - `id` -> `conversation_id`
  - `expert_id` -> `expert_user_id`
  - `learner_id` -> `learner_user_id`
  - `created_at/updated_at` -> matching
  - `last_message_at` -> matching
  - v1 `booking_id` (if present) -> **do not import** unless `docs/bible/convene_bible_032526.rtf` explicitly adds a matching column; v2 links bookings via messages/metadata per Bible.

### Import status
- `importable` + derived names

---

## Table: `messages` (V2)
### V2 columns (Bible)
- `message_id`
- `conversation_id`
- `sender_id`
- `message`
- `is_read` (yes/no)
- `created_at`
- `metadata` (JSONB)
  - examples: `type=reschedule_request|time_suggestion`, bookingId, proposedDate, proposedStartTime, proposedEndTime, status pending|accepted|declined

### V1 source candidates
- v1 table: `messages`
  - `id` -> `message_id`
  - `conversation_id` -> same
  - `sender_id` -> same
  - `message` -> same (v1 code uses `message` key, not `message_text`)
  - `is_read` -> cast bool <-> yes/no
  - `created_at` -> same
  - `metadata` -> same JSONB

### Import status
- `importable` + minor type transforms

---

## Table: `message_response_times` (V2)
### V2 columns (Bible)
- `id` (primary key)
- `conversation_id`
- `expert_id`
- `learner_id`
- `learner_message_id`
- `expert_message_id`
- `response_time_seconds` (NOT NULL)
- `created_at`
- invariants:
  - unique(learner_message_id)
  - only create row when inserted message is expert reply and there is a prior learner message

### V1 source candidates
- v1 `messages` table (conversation threads)
  - compute response times from message `created_at` when:
    - learner sends message
    - next message by expert exists

### Import status
- `derived` (computed backfill)

### Sender role (learner vs expert) — **not an open question**

- v1 does **not** need a separate “role” column if `conversations` stores **`learner_id`** and **`expert_id`** (as user ids).  
- **Derive role:** compare `messages.sender_id` to `conversations.learner_id` vs `conversations.expert_id` (after resolving either side to **`users.user_id`** if your v1 ids point at profile tables).

---

## Table: `expert_response_time_stats` (V2)
### V2 columns (Bible)
- `expert_id` (primary key)
- `response_interval_count`
- `total_response_time_seconds`
- `updated_at`

### V1 source candidates
- derived from `message_response_times`

### Import status
- `derived` (aggregate)

---

## Table: `reviews_of_experts` (V2)
### V2 columns (Bible)
- `review_id`
- `booking_id`
- `learner_reviewer_id`
- `expert_reviewee_id`
- `overall_rating`
- `questions_rating`
- `knowledgeable_rating` *(exact name per `docs/bible/convene_bible_032526.rtf`)*
- `personable_rating`
- `public_review`
- `private_message`
- `created_at`, `updated_at`

### V1 source candidates
- v1 table: `expert_reviews`
  - `id` -> `review_id`
  - `session_id` -> `booking_id` (confirm if v1 session_id == v1 bookings.id; code uses `sessionId` in UI)
  - `reviewer_id` (learner) -> `learner_reviewer_id`
  - `reviewee_id` (expert) -> `expert_reviewee_id`
  - ratings:
    - `overall_rating` -> `overall_rating`
    - `questions_rating` -> `questions_rating`
    - `knowledge_rating` -> **`knowledgeable_rating`** (or whatever the Bible names this column — **must match Bible exactly**)
    - `punctuality_rating` -> **`personable_rating`** (owner-confirmed)

### Import status
- `importable` with mapping/renaming for rating fields

### Decisions (owner-confirmed)
- v1 **`punctuality_rating`** → v2 **`personable_rating`** for **`reviews_of_experts`**.

---

## Table: `reviews_of_learners` (V2)
### V2 columns (Bible)
- `review_id`
- `booking_id`
- `expert_reviewer_id`
- `learner_reviewee_id`
- `overall_rating`
- `prepared_rating`
- `respectful_rating`
- `personable_rating`
- `public_review`
- `private_message`
- `created_at`, `updated_at`

### V1 source candidates
- v1 table: `learner_reviews`
  - `session_id` -> `booking_id`
  - `reviewer_id` (expert) -> `expert_reviewer_id`
  - `reviewee_id` (learner) -> `learner_reviewee_id`
  - `overall_rating` -> same
  - `prepared_rating` -> same
  - `respectful_rating` -> same
  - `punctuality_rating` -> **`personable_rating`** (owner-confirmed)

### Import status
- `importable` with field mapping

### Decisions (owner-confirmed)
- v1 **`punctuality_rating`** → v2 **`personable_rating`** for **`reviews_of_learners`**.

---

## Table: `requests` (V2)
### V2 columns (Bible)
- `request_id`
- `user_id`
- `full_name` (derived)
- `title`
- `description`
- `category_id` (FK)
- `skills` TEXT[] (max 10 tags)
- `is_active` (yes/no)
- `is_public` (yes/no)
- `response_count`
- `created_at`, `updated_at`
- `expires_at`

### V1 source candidates
- **Primary request rows (legacy table `user_posts`)** + **request responses (legacy table `post_responses`)**
  - `user_posts.title` -> `requests.title`
  - `user_posts.description` -> `requests.description`
  - `user_posts.category` (string) -> `requests.category_id` (via categories table)
  - `user_posts.skills` -> `requests.skills`
  - `user_posts.is_active` -> `requests.is_active`
  - created timestamps -> same
  - expiration mapping:
    - v1 `expires_at` might exist (check v1 migrations); if not, compute based on created_at + your active window rules
  - `response_count`:
    - v1 might store `response_count` or compute from **`post_responses`** rows

- **Alternate v1 request storage (legacy tables `questions` / `question_responses` / `question_notifications`)**
  - Map fields such as `questions.title`, `description`, `category`, `skills`, `status`, `expires_at` only if you ever reverse the no-import decision (same v2 target: **`requests`**).

### Import status
- `new_no_v1_source` (excluded from v1 import; v2 starts empty and is built going forward).

### TODO
1. (intentionally skipped) request-board migration excluded.

---

## Table: `request_responses` (V2)
### V2 columns (Bible)
- `response_id`
- `request_id`
- `expert_user_id` *(per Bible; not legacy `expert_id` unless Bible says otherwise)*
- `message`
- `is_seen` (yes/no)
- `upvote_count` (optional aggregate; truth in `request_response_upvotes`)
- `responded_at`

### V1 source candidates
- From v1 **request responses** (legacy table **`post_responses`**) *(only if you reverse the “no request-board import” decision)*:
  - `post_responses.id` -> `response_id`
  - `post_id` -> `request_id`
  - `expert_id` -> **`expert_user_id`** (resolve to `users.user_id` if v1 stores profile ids)
  - `message` -> `message`
  - `created_at` -> `responded_at`
  - `is_read` -> `is_seen` (depending on how v1 tracks “seen” vs read)

### Import status
- `new_no_v1_source` (excluded from v1 import).

### TODO
 - (intentionally skipped) request-board migration excluded.

---

## Table: `seen_requests` (V2)
### V2 columns (Bible)
- `request_id`
- `expert_id`
- `seen_at`
- unique(request_id, expert_id)

### V1 source candidates
- v1 **seen-requests** join data (legacy table **`seen_posts`**)
  - `post_id` -> `request_id`
  - `expert_id` -> `expert_id`
  - `seen_at` -> same

### Import status
- `new_no_v1_source` (excluded from v1 import).

---

## Table: `archived_requests` (V2)
### V2 columns (Bible)
- `request_id`
- `expert_id`
- `archived_at`
- unique(request_id, expert_id)

### V1 source candidates
- v1 **archived-requests** join data (legacy table **`archived_posts`**) -> map to `archived_requests`

### Import status
- `new_no_v1_source` (excluded from v1 import).

---

## Table: `request_response_upvotes` (V2)
### V2 columns (Bible)
- `response_id`
- `user_id`
- `created_at`
- unique(response_id, user_id)

### V1 source candidates
- v1 repo may or may not persist upvotes for the public request board.

### Import status
- `new_no_v1_source` (excluded from v1 import).

### TODO
- (intentionally skipped) request-board migration excluded.

---

## Table: `categories` (V2)
### V2 columns (Bible)
- `category_id`
- `name` (unique, required)
- `icon`
- `is_active` (yes/no)
- created_at, updated_at

### V1 source candidates
- v1 categories are hardcoded in UI (e.g. `src/components/CategoryNav.tsx`) and also appear as strings in:
  - `expert_profiles.category`
  - learner **request** `category` strings (v1 columns on legacy request tables / expert profile)

### Import status
- `derived` (seed)

### Category `icon` — plain language + migration

- **Option A (recommended):** `icon` = **short identifier** the admin UI understands (e.g. Lucide name `"Briefcase"`, or your own key like `category_finance`). The **actual drawing** lives in v2 code (icon library). Admin “change icon” = **change the identifier** in the DB; the app renders it. **Migrate** current v1/hardcoded icons by **recording that same identifier** in `categories.icon` for each seeded row.
- **Option B:** store **raw SVG markup or path data** in the DB. Gives maximum freedom but heavier rows, harder validation, and you must **sanitize** SVG on save (security).

**Owner intent:** editable icons on admin + **migrate icons already in use** → use **Option A** (identifiers), unless you later add optional `icon_svg` for one-offs.

---

## Table: `transactions` (V2)
### V2 columns (Bible)
- `transaction_id`
- `booking_id`
- `expert_id`
- `learner_id`
- `booking_amount`
- `extensions_amount`
- `platform_fee`
- `taxes_fees`
- `total_charge`
- `expert_earnings`
- `status`
- `payment_method`
- `transaction_date`
- created_at, updated_at

### V1 source candidates
- v1 may have a `transactions` (or payment) table with partial Stripe fields — **owner decision: skip import** for v2 launch; archive v1 financials if needed.

### Import status
- **Owner decision: do not migrate** v1 transaction rows into v2 `transactions` (or migrate **only** if you later define a minimal mapping). v2 table can start **empty** and backfill from Stripe going forward.

### Decisions (owner-confirmed)
- **No import** of legacy breakdown fields (`platform_fee`, `taxes_fees`, `expert_earnings`, `total_charge`, `transaction_date`) from v1 unless you run a dedicated reconciliation project.

---

## v1 tables/fields that may become “not represented” in v2 (to archive)
This section is intentionally incomplete; fill it as you confirm.

- v1 request-board data (legacy tables **`questions`**, **`question_notifications`**, **`question_responses`**, **`user_posts`**, **`post_responses`**, **`seen_posts`**, **`archived_posts`**) will not be migrated into v2 `requests*`.
- v1 `payouts` table (if v2 uses only `transactions` for payout history and it’s not represented in Bible DB structure; confirm).
- v1 `availability_schedules` **row-per-day** table vs v2 **JSONB `weekly_schedule` + `availability_overrides`**: **prefer v2 Bible shape** (single row per expert in `expert_availability`).  
  - **Argument for a separate table:** only if you need heavy SQL reporting (e.g. “all experts free Tuesday 3pm”) without parsing JSON — then consider a **materialized view** or **normalized mirror** updated by triggers/app, not as the primary authoritative store.
- v1 `expert_profiles.hourly_rate`, if v2 expects hourly rate stored in `expert_availability`.

---

## Next steps (implementation)
- **Schema & product:** maintain **`docs/bible/convene_bible_032526.rtf`** as the single contract; generate migrations from the Bible, not from this file.
- **Runnable ETL (repo):** `npm install` at the repo root (adds migration devDependencies), copy **`v1 migration/.env.migration.example`** → **`v1 migration/.env.migration`**, then **`npm run migrate:v1-v2`**. Set **`DRY_RUN=true`** first to print v1 row counts only. **Owner rule in script:** every imported **`expert_profiles.expert_status`** is set to **`temp`** (and **`is_verified = false`**), regardless of v1 approval.
- **Optional v1 import:** the script implements this doc’s **Global decisions** + the per-table sections it covers; resolve **profile id → `users.user_id`** where v1 used mixed identifiers (see resolver in **`v1 migration/migrate.mjs`**).
- **Bookings:** on import, set **`status = 'complete'`** for all historical rows; **never** copy raw v1 status strings into v2.
- **Transactions / Stripe:** v2 `transactions` may start empty; backfill from Stripe/webhooks going forward unless you define a separate reconciliation project.

### Note on Bible vs this document
Any future ambiguity should be **resolved in the Bible** (`docs/bible/convene_bible_032526.rtf`). After Bible changes, **update this mapping doc** only if it affects how v1 rows are transformed — not to steer application behavior.

