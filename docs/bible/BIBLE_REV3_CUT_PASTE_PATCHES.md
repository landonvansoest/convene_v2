# Bible rev3 — cut-and-paste patch guide

Use this file to update `convene_bible_032526.rtf` (or your master Word/Google doc).

**Finding text in the RTF:** open `convene_bible_032526.rtf` and use Find for the **heading** or **unique phrase** in the “Locate” column.

**Line numbers (optional):** they refer to plain text from:

`textutil -convert txt -stdout docs/bible/convene_bible_032526.rtf | nl -ba`

They help you scroll the exported text; Word line numbers may differ.

---

## A. Hosting typo

| Action | Locate | Replace with |
|--------|--------|--------------|
| **REPLACE** | **§16 Deployment Knowledge → Hosting Platforms** — bullet that reads `- **Vercel` (missing close) | RTF ~L338–339; plain text **~L256–257** | `- **Vercel**` |

---

## B. Stack contradiction (react-router vs Next.js)

| Action | Locate | Replace with |
|--------|--------|--------------|
| **REPLACE** | **§13 Utility Libraries** — line `- **react-router-dom**: Client-side routing` | Plain text **~L211** | `- **next/navigation** + Next.js App Router file-based routes (do not use react-router-dom for v2 app routing).` |

---

## C. Search doc: `faq` vs `faq_entries`

| Action | Locate | Replace with |
|--------|--------|--------------|
| **REPLACE** | **Search engine contract → Search document** — bullet `FAQ entries: include faq_entries.question + faq_entries.answer` | Plain text **~L349** | `FAQ entries: include public published rows from the FAQ table (columns question + answer) — same logical content as “faq entries” in code; table name in DB is **faq** (or alias view **faq_entries** if preferred).` |

---

## D. Derived display names (implementation note — strengthens existing rule)

| Action | Locate | Paste after |
|--------|--------|-------------|
| **INSERT after** | **DATABASE STRUCTURE** intro, sentence ending “…written directly by clients.” | Plain text **after ~L1437** | **New paragraph:** `Implementation note: For tables that list expert_full_name / learner_full_name as “derived read-only … not stored as an editable field”, do not add those names as physical columns on bookings, conversations, or requests. Expose them only via SQL VIEWs (e.g. bookings_with_parties) or application joins to users.` |

---

## E. Cross-midnight sessions (same date + wall times)

| Action | Locate | Paste after |
|--------|--------|-------------|
| **INSERT after** | **Table: bookings** — after the bullets for `start_time (time-of-day)` and `end_time (time-of-day)` and `duration` | Plain text **after ~L1562–1565** (immediately under duration / time fields) | **New “Rule” block:** `Cross-midnight resolution: session_date is the calendar date of session start in the booking’s canonical timezone. start_time and end_time are local wall-clock times. If end_time ≤ start_time, end instant is interpreted as the following calendar day at end_time (session spans midnight). Duration and num_15min_blocks are computed from the resolved start/end datetimes. Sessions must still respect expert minimum_booking and maximum_booking once resolved.` |

*(If you meant “sessions that extend past 12:00 noon” only, same-day times already cover that; this rule is for **overnight** sessions.)*

---

## F. Learner profile — Reviews box (wrong copy; expert text pasted)

| Action | Locate | Replace with |
|--------|--------|--------------|
| **REPLACE** | **### Learner profile (/learner/:id) → Row #3 → Reviews box** — two bullets | Plain text **~L724–726** | **Bullet 1:** `Large number for average reviews, five-star visualization, “(Based on [x] reviews)”, and distribution by star rating for **reviews the learner has received** (from experts).` **Bullet 2:** `Full list: **expert** reviewer profile photo, **expert** name, **expert’s** star ratings of the **learner**, date, public review text, aligned to **reviews_of_learners** (expert_reviewer_id → learner_reviewee_id).` |

---

## G. First-session discount — `discount_redemptions` status + one row per pair

| Action | Locate | Replace with |
|--------|--------|--------------|
| **REPLACE** | **Table: discount_redemptions** — the `status` line that says `pending \| consumed \| voided` and surrounding rules | Plain text **~L1666–1681** | **Fields (clarified):** `status` enum: **`reserved`** (checkout in progress; discount applied in quote; not yet paid), **`consumed`** (FSD used on a successful payment toward a **completed** traditional session with this expert–learner pair per FSD rules), **`voided`** (checkout abandoned, payment failed, or booking cancelled before successful charge). **Constraint:** at most **one row per (expert_user_id, learner_user_id)** for the FSD program lifetime. **Eligibility:** learner is eligible only if there is **no** `consumed` row for that pair **and** there is **no** prior **completed** traditional **`bookings`** row for that pair. **Retry:** if status is **`voided`**, a new checkout may create/update the same row to **`reserved`** again; **`consumed`** is terminal (never overwritten). |

---

## H. `transactions` — links to booking / freelance / package + money status

| Action | Locate | Paste after |
|--------|--------|-------------|
| **INSERT after** | **Table: transactions** field list (after `updated_at`) and **before** `### Session pricing & ledger` | Plain text **after ~L1867**, before **~L1869** | **New subsection:** `Ledger row rules: (1) transaction_type is required (session_booking, session_extension, freelance_work, package_purchase, custom_offer, adjustment, …). (2) Exactly one primary FK among booking_id, freelance_id, package_id must be set for charge rows (whichever entity is being paid for). (3) adjustment/refund rows: either reference the original charge via metadata (prior transaction_id) or use a dedicated adjustment convention documented in implementation. (4) transactions.status documents payment/settlement (e.g. succeeded, refunded, disputed); it is separate from bookings.payment_status.` |

---

## I. `offers` vs `transactions` + optional `offer_usages`

| Action | Locate | Paste after |
|--------|--------|-------------|
| **INSERT after** | Paragraph ending “timestamps + audit fields” under **Store special offers in an `offers`…** | Plain text **after ~L880** | **New paragraph:** `Money: offers record negotiation only. When the learner pays, create the canonical **transactions** row (and booking/freelance rows as applicable). offers.status tracks negotiation (offered, accepted, denied, …); transactions.status tracks money. Recommended: optional offer_id on transactions or bookings for traceability. **offer_usages:** optional; omit if each accepted offer maps to a single Stripe PaymentIntent with idempotency — enforce “one charge per acceptance” in checkout, not a separate table.` |

---

## J. Supabase Auth ↔ `public.users` (your Q1 — exact Bible language)

| Action | Locate | Paste after |
|--------|--------|-------------|
| **INSERT after** | **§2 Supabase** bullets (after “use Supabase SDK to connect database”) | Plain text **after ~L51** | **New bullets:** `- **Users row:** public.users.user_id MUST equal auth.users.id for each account. On sign-up and sign-in, the server upserts public.users from Auth; credentials live only in Supabase Auth. - **No password column** in public.users; remove password from the Table: users field list in DATABASE STRUCTURE.` |

---

## K. Table: users — remove duplicate and password

| Action | Locate | Replace with |
|--------|--------|--------------|
| **DELETE one** | **Table: users** — second bullet `- user_id` | Plain text **~L1457** | *(remove duplicate line)* |
| **DELETE** | **Table: users** — `- password` | Plain text **~L1447** | *(remove; Auth handles passwords)* |

---

## L. Same person: expert and learner

| Action | Locate | Paste after |
|--------|--------|-------------|
| **INSERT after** | **Profile visibility state machine** list / transitions (e.g. after learner transition bullets) | Plain text **after ~L508** | **New paragraph:** `Single account, dual roles: the same user_id may have learner profile data in users and also an expert_profiles row. Visibility and gating are evaluated per context (learner-facing vs expert-facing); both expert_hidden_* and learner_hidden_* states may apply to one account over time.` |

---

## M. FSD “qualifying” = completed bookings only

| Action | Locate | Replace with |
|--------|--------|--------------|
| **REPLACE** | **expert_availability** — **Eligibility** paragraph “Define ‘qualifying’ in the Bible…” | Plain text **~L1551** | `**Qualifying (FSD):** a traditional **bookings** row for this expert_user_id + learner_user_id with **status = complete** (and successful payment per product rules). If such a row exists, the learner is **not** eligible for first-session discount with that expert.` |

---

## N. `profile_embedding` / vector (plain-language glossary)

| Action | Locate | Paste under |
|--------|--------|-------------|
| **INSERT under** | **expert_profiles** — “Rules:” for search_vector / profile_embedding | Plain text **~L1492–1496** | **New bullet:** `profile_embedding is a fixed-length numeric vector generated by a chosen embedding model from the expert’s searchable text; it enables semantic similarity search. Implementation must fix one model and dimension (e.g. 1536) and document them here.` |

---

## O. `payment_status` only on `bookings`

| Action | Locate | Paste after |
|--------|--------|-------------|
| **INSERT after** | **Table: bookings** — after `payment_status` field line | Plain text in bookings block **~L157x** (where payment_status appears) | **New rule:** `payment_status exists only on bookings. transactions uses its own status for money ledger state; do not add payment_status to transactions.` |

Also **UPDATE** reminder text if needed:

| Action | Locate | Replace with |
|--------|--------|--------------|
| **REPLACE** | **Sign-up and account → notifications** — “payment_status / confirmation flags per Bible” | Plain text **~L1035** | `bookings.status (upcoming/live/complete) and bookings.payment_status only; do not reference legacy v1 statuses.` |

---

## P. Admin: in-app page copy (no third-party CMS)

| Action | Locate | Replace with |
|--------|--------|--------------|
| **REPLACE** | **Admin dashboard** bullet “Ability to edit all text blocks by page…” | Plain text **~L1401** | `Manage **site page copy** in-app (no third-party CMS): store editable headings, subheadings, and body text per page/section in a **page_content** table (or equivalent): page_key (e.g. about, home_hero), block_key (e.g. hero_heading, hero_subheading), body text, status (draft/published), updated_at. Admin UI edits blocks; public site reads published rows only. FAQ may remain in **faq** or be merged into page_content — pick one source of truth to avoid duplication.` |

Also **REPLACE** the CMS question:

| Action | Locate | Replace with |
|--------|--------|--------------|
| **REPLACE** | Opening sentence “Advise me if or when it makes sense to use a CMS…” | Plain text **~L1390** | `Build admin-managed content in the database as specified below (no external CMS).` |

---

## Q. Optional: new **Table: page_content** in DATABASE STRUCTURE

| Action | Locate | Paste after |
|--------|--------|-------------|
| **INSERT after** | **Table: FAQ** rules (end of FAQ table section) | *(search `Table: FAQ` in RTF — near file end)* | **New table:** `Table: page_content` — Fields: `content_id`, `page_key`, `block_key`, `body` (text), `status` (draft/published), `published_at`, `created_at`, `updated_at`. Unique `(page_key, block_key)` for published content versioning as needed. |

---

## Quick reference: plain-text line numbers

| Topic | Approx. lines (textutil export) |
|--------|--------------------------------|
| Vercel typo | 256–257 |
| react-router-dom | 211 |
| faq_entries | 349 |
| DATABASE STRUCTURE intro | 1431–1437 |
| bookings times / duration | 1554–1565 |
| Learner profile Reviews | 723–726 |
| offers paragraph | 872–884 |
| FSD eligibility expert_availability | 1551 |
| Admin page text | 1390–1401 |
| notifications booking reminder | 1035 |
| discount_redemptions table | 1666–1681 |
| transactions fields | 1851–1867 |
| Supabase section | 42–51 |
| Visibility transitions | 492–508 |

---

*End of cut-and-paste guide.*
