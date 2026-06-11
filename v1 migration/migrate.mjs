/**
 * V1 → V2 one-time ETL (implements rules in V1_to_V2_DB_MAPPING.md).
 *
 * Prereqs:
 *   - v2 DB has migrations 001–009 applied; auth.users ↔ public.users trigger (003) active.
 *   - V1 and V2 Supabase service_role keys in .env.migration (see .env.migration.example).
 *
 * Run from repo root:
 *   npm run migrate:v1-v2
 *
 * DRY_RUN=true still paginates all v1 tables (PostgREST egress); it only skips v2 writes.
 * In CI, set ALLOW_V1_ETL_IN_CI=true or the script exits immediately.
 *
 * Owner override: ALL imported expert_profiles get expert_visibility_state = 'visible_temp' (and is_verified = false).
 *
 * Skipped per mapping: requests*, transactions, freelance_work, expert_packages, credits,
 * discount_redemptions, offers content, v1 online_available → users.online (users.online = false).
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomBytes, randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, ".env.migration") });

const DRY = String(process.env.DRY_RUN || "").toLowerCase() === "true";
const PHASES = (process.env.MIGRATE_PHASES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
function phase(name) {
  return PHASES.length === 0 || PHASES.includes(name);
}

function pick(row, keys, fallback = null) {
  if (!row) return fallback;
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return fallback;
}

async function fetchAll(client, table, columns = "*") {
  const page = 500;
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await client.from(table).select(columns).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return out;
}

function randomPassword() {
  return randomBytes(24).toString("base64url");
}

function toIntervalMinutes(n) {
  const m = Number(n);
  if (!Number.isFinite(m) || m <= 0) return null;
  return `${Math.round(m)} minutes`;
}

function toIntervalDays(n) {
  const d = Number(n);
  if (!Number.isFinite(d) || d <= 0) return null;
  return `${Math.round(d)} days`;
}

/** v1 hourly USD → v2 rate per 15 minutes */
function hourlyToPer15(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x / 4) * 100) / 100;
}

function mapSubscriptionStatus(v) {
  const s = String(v || "").toLowerCase();
  const allowed = new Set(["active", "trialing", "past_due", "canceled", "unpaid"]);
  if (allowed.has(s)) return s;
  if (s === "cancelled") return "canceled";
  return "canceled";
}

function mapPaymentStatusForHistory(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("paid") || s === "succeeded" || s === "complete") return "paid";
  return "paid";
}

function clampRating(n, fallback = 5) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(5, Math.max(1, Math.round(x)));
}

async function main() {
  if (
    process.env.CI === "true" &&
    String(process.env.ALLOW_V1_ETL_IN_CI || "").toLowerCase() !== "true"
  ) {
    console.error(
      "[migrate] Refusing to run in CI: this job reads all v1 tables over PostgREST (high egress). Set ALLOW_V1_ETL_IN_CI=true if intentional."
    );
    process.exit(1);
  }

  const v1Url = process.env.V1_SUPABASE_URL;
  const v1Key = process.env.V1_SUPABASE_SERVICE_ROLE_KEY;
  const v2Url = process.env.V2_SUPABASE_URL;
  const v2Key = process.env.V2_SUPABASE_SERVICE_ROLE_KEY;
  if (!v1Url || !v1Key || !v2Url || !v2Key) {
    console.error(
      "Missing env. Copy v1 migration/.env.migration.example → .env.migration and fill V1_* and V2_* URLs and service_role keys."
    );
    process.exit(1);
  }

  const v1 = createClient(v1Url, v1Key, { auth: { persistSession: false } });
  const v2 = createClient(v2Url, v2Key, { auth: { persistSession: false } });

  const log = (...a) => console.log("[migrate]", ...a);

  log("DRY_RUN =", DRY);

  // --- Probe v1 tables (best-effort names) ---
  const v1Users = await tryFetchAll(v1, "users");
  const v1Experts = await tryFetchAll(v1, "expert_profiles");
  const v1Avail = await tryFetchAll(v1, "expert_availability");
  const v1Bookings = await tryFetchAll(v1, "bookings");
  const v1Convos = await tryFetchAll(v1, "conversations");
  const v1Messages = await tryFetchAll(v1, "messages");
  const v1RevExp = await tryFetchAll(v1, "expert_reviews");
  const v1RevLearn = await tryFetchAll(v1, "learner_reviews");
  const v1Subs = await tryFetchAll(v1, "user_subscriptions");

  log("v1 row counts:", {
    users: v1Users.length,
    expert_profiles: v1Experts.length,
    expert_availability: v1Avail.length,
    bookings: v1Bookings.length,
    conversations: v1Convos.length,
    messages: v1Messages.length,
    expert_reviews: v1RevExp.length,
    learner_reviews: v1RevLearn.length,
    user_subscriptions: v1Subs.length,
  });

  if (DRY) {
    log("Dry run: no writes.");
    return;
  }

  const profileIdToUserId = new Map();
  const userIdToProfileId = new Map();
  for (const e of v1Experts) {
    const uid = pick(e, ["user_id"]);
    const pid = pick(e, ["expert_profile_id", "id"]);
    if (uid && pid) {
      profileIdToUserId.set(String(pid), String(uid));
      userIdToProfileId.set(String(uid), String(pid));
    }
  }

  function resolvePartyId(raw) {
    if (!raw) return null;
    const s = String(raw);
    if (profileIdToUserId.has(s)) return profileIdToUserId.get(s);
    return s;
  }

  // --- Phase: categories (seed from v1 expert category strings) ---
  let categoryNameToId = new Map();
  if (phase("categories")) {
    const names = new Set();
    for (const e of v1Experts) {
      const c = pick(e, ["category", "category_name", "area_of_expertise"]);
      if (c && typeof c === "string" && c.trim()) names.add(c.trim());
    }
    const { data: existing } = await v2.from("categories").select("category_id, name");
    for (const r of existing || []) categoryNameToId.set(r.name, r.category_id);
    for (const name of names) {
      if (categoryNameToId.has(name)) continue;
      const { data, error } = await v2.from("categories").insert({ name, is_active: true }).select("category_id").single();
      if (error) {
        const { data: again } = await v2.from("categories").select("category_id").eq("name", name).maybeSingle();
        if (again?.category_id) categoryNameToId.set(name, again.category_id);
        else log("category insert skip:", name, error.message);
      } else if (data?.category_id) {
        categoryNameToId.set(name, data.category_id);
      }
    }
    log("categories: v2 name map size", categoryNameToId.size);
  } else {
    const { data: existing } = await v2.from("categories").select("category_id, name");
    for (const r of existing || []) categoryNameToId.set(r.name, r.category_id);
  }

  // --- Phase: auth + public.users ---
  const userIds = new Set();
  for (const u of v1Users) {
    const id = pick(u, ["id", "user_id"]);
    if (id) userIds.add(String(id));
  }
  for (const e of v1Experts) {
    const id = pick(e, ["user_id"]);
    if (id) userIds.add(String(id));
  }
  for (const b of v1Bookings) {
    const ex = pick(b, ["expert_user_id", "expert_id"]);
    const le = pick(b, ["learner_user_id", "learner_id"]);
    if (ex) userIds.add(String(resolvePartyId(ex)));
    if (le) userIds.add(String(resolvePartyId(le)));
  }

  if (phase("auth_users")) {
    for (const u of v1Users) {
      const id = pick(u, ["id", "user_id"]);
      const email = pick(u, ["email", "email_address"]);
      if (!id || !email) continue;
      const first = String(pick(u, ["first_name"], "") || "");
      const last = String(pick(u, ["last_name"], "") || "");
      const { error } = await v2.auth.admin.createUser({
        id: String(id),
        email: String(email),
        email_confirm: true,
        password: randomPassword(),
        user_metadata: { first_name: first, last_name: last, migrated_from_v1: true },
      });
      if (error && !String(error.message).toLowerCase().includes("already been registered")) {
        log("auth createUser warn:", id, error.message);
      }
    }
    log("auth_users: processed v1 users table");
  }

  if (phase("users_profile")) {
    for (const u of v1Users) {
      const id = pick(u, ["id", "user_id"]);
      if (!id) continue;
      const email = String(pick(u, ["email", "email_address"], "") || "");
      const emailVerified =
        pick(u, ["email_verified"]) === true ||
        pick(u, ["email_verified"]) === "true" ||
        pick(u, ["email_confirmed_at"]) != null;
      const payload = {
        user_id: String(id),
        email_address: email,
        email_verified: emailVerified,
        first_name: String(pick(u, ["first_name"], "") || ""),
        last_name: String(pick(u, ["last_name"], "") || ""),
        profile_photo: pick(u, ["profile_photo", "profile_photo_url"]),
        phone_number: pick(u, ["phone_number", "phone", "phoneNumber"]),
        hometown: pick(u, ["hometown"]),
        language: pick(u, ["language", "preferred_language"]),
        profession: pick(u, ["profession", "professional_title"]),
        introduction: pick(u, ["introduction", "about"]),
        birthday: pick(u, ["birthday"]),
        gender: pick(u, ["gender"]),
        online: false,
        sessions_booked: Number(pick(u, ["sessions_booked"], 0)) || 0,
        sessions_completed: Number(pick(u, ["sessions_completed"], 0)) || 0,
        learner_dependability_rating: pick(u, ["learner_dependability_rating"]),
        has_expert_profile: userIdToProfileId.has(String(id)),
        updated_at: new Date().toISOString(),
      };
      const { error } = await v2.from("users").upsert(payload, { onConflict: "user_id" });
      if (error) log("users upsert error:", id, error.message);
    }
    log("users_profile: upserted", v1Users.length);
  }

  // --- expert_profiles: ALL temp, is_verified false ---
  if (phase("expert_profiles")) {
    for (const e of v1Experts) {
      const user_id = pick(e, ["user_id"]);
      if (!user_id) continue;
      const catStr = pick(e, ["category", "category_name"]);
      let category_id = pick(e, ["category_id"]);
      if (!category_id && catStr && categoryNameToId.has(String(catStr).trim())) {
        category_id = categoryNameToId.get(String(catStr).trim());
      }
      const skillsRaw = pick(e, ["skills_specializations", "area_of_expertise", "skills"]);
      let skills_specializations = [];
      if (Array.isArray(skillsRaw)) skills_specializations = skillsRaw.map(String);
      else if (typeof skillsRaw === "string")
        skills_specializations = skillsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 50);

      const expert_profile_id = pick(e, ["expert_profile_id", "id"]);
      const row = {
        user_id: String(user_id),
        ...(expert_profile_id ? { expert_profile_id: String(expert_profile_id) } : {}),
        expert_visibility_state: "visible_temp",
        experience_level: pick(e, ["experience_level"]),
        category_id: category_id || null,
        qualifications: pick(e, ["qualifications", "education", "certifications"]),
        expert_bio: pick(e, ["expert_bio", "bio"]),
        about_services: pick(e, ["about_services"]),
        skills_specializations,
        is_verified: false,
        expert_dependability_rating: null,
        complete_sessions: Number(pick(e, ["complete_sessions"], 0)) || 0,
        stripe_connect_account_id: pick(e, ["stripe_connect_account_id", "stripe_account_id"]),
        updated_at: new Date().toISOString(),
      };
      const { error } = await v2.from("expert_profiles").upsert(row, { onConflict: "user_id" });
      if (error) log("expert_profiles error:", user_id, error.message);
    }
    log("expert_profiles: upserted", v1Experts.length, "(all expert_visibility_state=visible_temp)");
  }

  // Refresh v2 expert_profile_id map for bookings
  const v2ProfileByExpertUser = new Map();
  {
    const { data } = await v2.from("expert_profiles").select("user_id, expert_profile_id");
    for (const r of data || []) v2ProfileByExpertUser.set(r.user_id, r.expert_profile_id);
  }

  if (phase("expert_availability")) {
    for (const a of v1Avail) {
      const user_id = pick(a, ["user_id"]);
      if (!user_id) continue;
      const hourly = pick(a, ["hourly_rate", "rate"]);
      const rate = hourly != null ? hourlyToPer15(hourly) : Number(pick(a, ["rate_per_15_min"], 0)) || 0;
      const row = {
        user_id: String(user_id),
        rate,
        weekly_schedule: pick(a, ["weekly_schedule"], {}) || {},
        availability_overrides: pick(a, ["availability_overrides", "date_overrides"], []) || [],
        available_now: false,
        available_until: null,
        minimum_booking: null,
        maximum_booking: null,
        minimum_notice: toIntervalMinutes(pick(a, ["min_notice_minutes", "minimum_notice_minutes"])),
        maximum_notice: toIntervalDays(pick(a, ["max_days_advance", "maximum_days_advance"])),
        buffer_time: pick(a, ["buffer_time"]) != null ? Number(pick(a, ["buffer_time"])) : null,
        auto_accept: Boolean(pick(a, ["auto_accept"], false)),
        extend_sessions: Boolean(pick(a, ["extend_sessions"], false)),
        allow_messaging: pick(a, ["allow_messaging"]) != null ? Boolean(a.allow_messaging) : true,
        first_session_discount_enabled: Boolean(
          pick(a, ["first_session_discount_enabled", "discount_first"], false)
        ),
        calendar_paused: Boolean(pick(a, ["calendar_paused"], false)),
        updated_at: new Date().toISOString(),
      };
      const { error } = await v2.from("expert_availability").upsert(row, { onConflict: "user_id" });
      if (error) log("expert_availability error:", user_id, error.message);
    }
    log("expert_availability: upserted", v1Avail.length);
  }

  if (phase("conversations")) {
    for (const c of v1Convos) {
      const conversation_id = pick(c, ["id", "conversation_id"]);
      const expert_raw = pick(c, ["expert_user_id", "expert_id"]);
      const learner_raw = pick(c, ["learner_user_id", "learner_id"]);
      const expert_user_id = resolvePartyId(expert_raw);
      const learner_user_id = resolvePartyId(learner_raw);
      if (!conversation_id || !expert_user_id || !learner_user_id) continue;
      const row = {
        conversation_id: String(conversation_id),
        expert_user_id: String(expert_user_id),
        learner_user_id: String(learner_user_id),
        created_at: pick(c, ["created_at"], new Date().toISOString()),
        updated_at: pick(c, ["updated_at"], new Date().toISOString()),
        last_message_at: pick(c, ["last_message_at"]),
      };
      const { error } = await v2.from("conversations").upsert(row, { onConflict: "conversation_id" });
      if (error) log("conversations error:", conversation_id, error.message);
    }
    log("conversations: upserted", v1Convos.length);
  }

  if (phase("messages")) {
    for (const m of v1Messages) {
      const message_id = pick(m, ["id", "message_id"]);
      const conversation_id = pick(m, ["conversation_id"]);
      const sender_id = pick(m, ["sender_id"]);
      if (!message_id || !conversation_id || !sender_id) continue;
      const row = {
        message_id: String(message_id),
        conversation_id: String(conversation_id),
        sender_id: String(sender_id),
        message: String(pick(m, ["message", "message_text", "body"], "") || ""),
        is_read: Boolean(pick(m, ["is_read"], false)),
        created_at: pick(m, ["created_at"], new Date().toISOString()),
        metadata: pick(m, ["metadata"], {}) || {},
      };
      const { error } = await v2.from("messages").upsert(row, { onConflict: "message_id" });
      if (error) log("messages error:", message_id, error.message);
    }
    log("messages: upserted", v1Messages.length);
  }

  if (phase("bookings")) {
    for (const b of v1Bookings) {
      const booking_id = pick(b, ["id", "booking_id"]);
      const expert_uid = resolvePartyId(pick(b, ["expert_user_id", "expert_id"]));
      const learner_uid = resolvePartyId(pick(b, ["learner_user_id", "learner_id"]));
      if (!booking_id || !expert_uid || !learner_uid) continue;
      const expert_profile_id = v2ProfileByExpertUser.get(String(expert_uid));
      if (!expert_profile_id) {
        log("bookings skip (no v2 expert_profile):", booking_id, expert_uid);
        continue;
      }
      const session_date = pick(b, ["session_date"]);
      const start_time = pick(b, ["start_time"]);
      const end_time = pick(b, ["end_time"]);
      if (!session_date || !start_time || !end_time) {
        log("bookings skip (missing session_date/start_time/end_time):", booking_id);
        continue;
      }
      const durMin = Number(pick(b, ["duration", "duration_minutes"], 60)) || 60;
      const duration = `${durMin} minutes`;
      const v1hourly = pick(b, ["hourly_rate", "rate"]);
      const rate = v1hourly != null ? hourlyToPer15(v1hourly) : Number(pick(b, ["rate"], 0)) || 0;
      const total_amount = Number(pick(b, ["total_amount", "total"], 0)) || 0;
      const row = {
        booking_id: String(booking_id),
        expert_user_id: String(expert_uid),
        learner_user_id: String(learner_uid),
        expert_profile_id,
        session_date,
        start_time,
        end_time,
        duration,
        rate,
        discount_applied: Number(pick(b, ["discount_applied"], 0)) || 0,
        booking_amount: total_amount,
        platform_fee: 0,
        taxes_fees: 0,
        total_amount,
        extensions: 0,
        extensions_amount: 0,
        status: "complete",
        payment_status: mapPaymentStatusForHistory(pick(b, ["payment_status"])),
        meeting_room_url: pick(b, ["meeting_room_url"]),
        daily_room_id: pick(b, ["daily_room_id", "daily_room_name"]),
        created_at: pick(b, ["created_at"], new Date().toISOString()),
        updated_at: pick(b, ["updated_at"], new Date().toISOString()),
        cancelled_at: pick(b, ["cancelled_at"]),
        cancellation_reason: pick(b, ["cancellation_reason"]),
        expert_joined: pick(b, ["expert_joined", "expert_joined_at"]),
        learner_joined: pick(b, ["learner_joined", "learner_joined_at"]),
        expert_delay: pick(b, ["expert_delay"]) != null ? Number(b.expert_delay) : null,
        learner_delay: pick(b, ["learner_delay"]) != null ? Number(b.learner_delay) : null,
        expert_dependability: null,
        learner_dependability: null,
        pending_reschedule_date: pick(b, ["pending_reschedule_date"]),
        pending_reschedule_start_time: pick(b, ["pending_reschedule_start_time"]),
        pending_reschedule_end_time: pick(b, ["pending_reschedule_end_time"]),
        reschedule_request_id: pick(b, ["reschedule_request_id"])
          ? String(pick(b, ["reschedule_request_id"]))
          : null,
        chat_transcript: pick(b, ["chat_transcript"]),
        session_transcript: pick(b, ["session_transcript"]),
      };
      const { error } = await v2.from("bookings").upsert(row, { onConflict: "booking_id" });
      if (error) log("bookings error:", booking_id, error.message);
    }
    log("bookings: upserted (status=complete)", v1Bookings.length);
  }

  if (phase("reviews_experts")) {
    for (const r of v1RevExp) {
      const review_id = pick(r, ["id", "review_id"]);
      const booking_id = String(pick(r, ["booking_id", "session_id"], ""));
      if (!review_id || !booking_id) continue;
      const row = {
        review_id: String(review_id),
        booking_id,
        learner_reviewer_id: String(pick(r, ["learner_reviewer_id", "reviewer_id"])),
        expert_reviewee_id: String(pick(r, ["expert_reviewee_id", "reviewee_id"])),
        overall_rating: clampRating(pick(r, ["overall_rating"], 5)),
        questions_rating:
          pick(r, ["questions_rating"]) != null ? clampRating(r.questions_rating) : null,
        knowledgeable_rating:
          pick(r, ["knowledgeable_rating", "knowledge_rating"]) != null
            ? clampRating(pick(r, ["knowledgeable_rating", "knowledge_rating"]))
            : null,
        personable_rating:
          pick(r, ["personable_rating", "punctuality_rating"]) != null
            ? clampRating(pick(r, ["personable_rating", "punctuality_rating"]))
            : null,
        public_review: pick(r, ["public_review", "review_text", "comment"]),
        private_message: pick(r, ["private_message"]),
        created_at: pick(r, ["created_at"], new Date().toISOString()),
        updated_at: pick(r, ["updated_at"], new Date().toISOString()),
      };
      const { error } = await v2.from("reviews_of_experts").upsert(row, { onConflict: "review_id" });
      if (error) log("reviews_of_experts error:", review_id, error.message);
    }
    log("reviews_of_experts: upserted", v1RevExp.length);
  }

  if (phase("reviews_learners")) {
    for (const r of v1RevLearn) {
      const review_id = pick(r, ["id", "review_id"]);
      const booking_id = String(pick(r, ["booking_id", "session_id"], ""));
      if (!review_id || !booking_id) continue;
      const row = {
        review_id: String(review_id),
        booking_id,
        expert_reviewer_id: String(pick(r, ["expert_reviewer_id", "reviewer_id"])),
        learner_reviewee_id: String(pick(r, ["learner_reviewee_id", "reviewee_id"])),
        overall_rating: clampRating(pick(r, ["overall_rating"], 5)),
        prepared_rating: pick(r, ["prepared_rating"]) != null ? clampRating(r.prepared_rating) : null,
        respectful_rating: pick(r, ["respectful_rating"]) != null ? clampRating(r.respectful_rating) : null,
        personable_rating:
          pick(r, ["personable_rating", "punctuality_rating"]) != null
            ? clampRating(pick(r, ["personable_rating", "punctuality_rating"]))
            : null,
        public_review: pick(r, ["public_review", "review_text", "comment"]),
        private_message: pick(r, ["private_message"]),
        created_at: pick(r, ["created_at"], new Date().toISOString()),
        updated_at: pick(r, ["updated_at"], new Date().toISOString()),
      };
      const { error } = await v2.from("reviews_of_learners").upsert(row, { onConflict: "review_id" });
      if (error) log("reviews_of_learners error:", review_id, error.message);
    }
    log("reviews_of_learners: upserted", v1RevLearn.length);
  }

  if (phase("subscriptions")) {
    for (const s of v1Subs) {
      const subscription_id = String(pick(s, ["subscription_id", "id"]) || randomUUID());
      const user_id = pick(s, ["user_id"]);
      if (!user_id) continue;
      const row = {
        subscription_id,
        user_id: String(user_id),
        stripe_customer_id: pick(s, ["stripe_customer_id", "customer_id"]),
        stripe_subscription_id: pick(s, ["stripe_subscription_id", "stripe_sub_id"]),
        plan_id: pick(s, ["plan_id", "price_id"]),
        status: mapSubscriptionStatus(pick(s, ["status"])),
        current_period_start: pick(s, ["current_period_start"]),
        current_period_end: pick(s, ["current_period_end"]),
        cancel_at_period_end: Boolean(pick(s, ["cancel_at_period_end"], false)),
        created_at: pick(s, ["created_at"], new Date().toISOString()),
        updated_at: pick(s, ["updated_at"], new Date().toISOString()),
      };
      const { error } = await v2.from("user_subscriptions").upsert(row, { onConflict: "subscription_id" });
      if (error) log("user_subscriptions error:", subscription_id, error.message);
    }
    log("user_subscriptions: upserted", v1Subs.length);
  }

  if (phase("response_times")) {
    const { data: convos } = await v2.from("conversations").select("conversation_id, expert_user_id, learner_user_id");
    let inserted = 0;
    for (const c of convos || []) {
      const { data: msgs } = await v2
        .from("messages")
        .select("message_id, sender_id, created_at")
        .eq("conversation_id", c.conversation_id)
        .order("created_at", { ascending: true });
      const list = msgs || [];
      let pendingLearner = null;
      for (const m of list) {
        const isLearner = String(m.sender_id) === String(c.learner_user_id);
        const isExpert = String(m.sender_id) === String(c.expert_user_id);
        if (isLearner) pendingLearner = m;
        else if (isExpert && pendingLearner) {
          const t0 = new Date(pendingLearner.created_at).getTime();
          const t1 = new Date(m.created_at).getTime();
          const response_time_seconds = Math.max(0, Math.round((t1 - t0) / 1000));
          const row = {
            id: randomUUID(),
            conversation_id: c.conversation_id,
            expert_id: c.expert_user_id,
            learner_id: c.learner_user_id,
            learner_message_id: pendingLearner.message_id,
            expert_message_id: m.message_id,
            response_time_seconds,
            created_at: new Date().toISOString(),
          };
          const { error } = await v2.from("message_response_times").upsert(row, {
            onConflict: "learner_message_id",
          });
          if (!error) inserted++;
          pendingLearner = null;
        }
      }
    }
    log("message_response_times: upserted approx", inserted);

    const { data: statsRows } = await v2.from("message_response_times").select("expert_id, response_time_seconds");
    const agg = new Map();
    for (const r of statsRows || []) {
      const id = r.expert_id;
      if (!agg.has(id)) agg.set(id, { count: 0, total: 0 });
      const a = agg.get(id);
      a.count++;
      a.total += Number(r.response_time_seconds) || 0;
    }
    for (const [expert_id, a] of agg) {
      await v2.from("expert_response_time_stats").upsert(
        {
          expert_id,
          response_interval_count: a.count,
          total_response_time_seconds: a.total,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "expert_id" }
      );
    }
    log("expert_response_time_stats: experts", agg.size);
  }

  log("Done. Skipped (per mapping): requests*, transactions, freelance/packages/credits/discounts, offers.");
}

async function tryFetchAll(client, table) {
  try {
    return await fetchAll(client, table, "*");
  } catch (e) {
    console.warn("[migrate] v1 table missing or unreadable:", table, String(e.message || e));
    return [];
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
