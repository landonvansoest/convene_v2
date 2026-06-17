#!/usr/bin/env node
// Check which v2 SQL migrations have been applied by sampling identifying
// artifacts (tables, columns, functions, rows) from each migration.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../apps/web/.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supa = createClient(url, key, { auth: { persistSession: false } })

// Each check returns { ok: bool, detail: string }.
// ok=true  => artifact present (migration applied)
// ok=false => artifact missing (migration NOT applied)
async function checkColumn(table, column) {
  const { error } = await supa.from(table).select(column).limit(0)
  if (!error) return { ok: true, detail: `${table}.${column} present` }
  return { ok: false, detail: `${table}.${column} → ${error.code}: ${error.message}` }
}
async function checkTable(table) {
  return checkColumn(table, '*')
}
async function checkRpc(fn, args = {}) {
  const { error } = await supa.rpc(fn, args)
  // PGRST202 = function not found in schema cache
  if (error && error.code === 'PGRST202') return { ok: false, detail: `rpc ${fn} → ${error.message}` }
  // Any other error means the function exists but call args were bad — fine for our purpose.
  if (error) return { ok: true, detail: `rpc ${fn} present (call err: ${error.code})` }
  return { ok: true, detail: `rpc ${fn} present` }
}
async function checkRow(table, filter) {
  let q = supa.from(table).select('*', { head: true, count: 'exact' })
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v)
  const { count, error } = await q
  if (error) return { ok: false, detail: `${table} ${JSON.stringify(filter)} → ${error.code}: ${error.message}` }
  return { ok: (count ?? 0) > 0, detail: `${table} ${JSON.stringify(filter)} count=${count}` }
}

const checks = [
  // Foundational tables — sanity baseline.
  { id: '002', label: 'core_schema (users)', run: () => checkTable('users') },
  { id: '002', label: 'core_schema (bookings)', run: () => checkTable('bookings') },
  { id: '002', label: 'core_schema (conversations)', run: () => checkTable('conversations') },
  { id: '002', label: 'core_schema (messages)', run: () => checkTable('messages') },

  // Spot-check a representative artifact per recent migration.
  { id: '010', label: 'featured_experts_settings table', run: () => checkTable('featured_experts_settings') },
  { id: '011', label: 'users.full_name (generated)', run: () => checkColumn('users', 'full_name') },
  { id: '013', label: 'users.convene_role_mode', run: () => checkColumn('users', 'convene_role_mode') },
  { id: '014', label: 'users.welcome_inbox_sent_at', run: () => checkColumn('users', 'welcome_inbox_sent_at') },
  { id: '015', label: 'user_feedback table', run: () => checkTable('user_feedback') },
  { id: '015', label: 'expert_profiles.registration_started_at', run: () => checkColumn('expert_profiles', 'registration_started_at') },
  { id: '017', label: 'expert_profiles.membership_price_override_cents', run: () => checkColumn('expert_profiles', 'membership_price_override_cents') },
  { id: '018', label: 'expert_availability.package_session_count', run: () => checkColumn('expert_availability', 'package_session_count') },
  { id: '020', label: 'expert_profiles.payout_details', run: () => checkColumn('expert_profiles', 'payout_details') },
  { id: '021', label: 'expert_availability.full_name', run: () => checkColumn('expert_availability', 'full_name') },
  { id: '022', label: 'expert_profiles.expert_visibility_state', run: () => checkColumn('expert_profiles', 'expert_visibility_state') },
  { id: '023', label: 'bookings.stripe_payment_intent_id', run: () => checkColumn('bookings', 'stripe_payment_intent_id') },
  { id: '025', label: 'bookings.refund_review_status', run: () => checkColumn('bookings', 'refund_review_status') },
  { id: '026', label: 'rpc latest_message_per_conversation', run: () => checkRpc('latest_message_per_conversation', { p_conversation_ids: [] }) },
  { id: '028', label: 'user_feedback.admin_review_status', run: () => checkColumn('user_feedback', 'admin_review_status') },
  { id: '029', label: 'expert_profiles.membership_override_expires_at', run: () => checkColumn('expert_profiles', 'membership_override_expires_at') },
  { id: '030', label: 'featured_experts_settings.require_profile_picture', run: () => checkColumn('featured_experts_settings', 'require_profile_picture') },
  { id: '035', label: 'site_text_blocks footer rows', run: () => checkRow('site_text_blocks', { page_slug: 'footer' }) },
  { id: '036', label: 'dev_tools table', run: () => checkTable('dev_tools') },
  { id: '031', label: 'categories.display_order', run: () => checkColumn('categories', 'display_order') },
  { id: '031', label: 'categories.subcategories', run: () => checkColumn('categories', 'subcategories') },
  { id: '032', label: 'site_text_blocks table', run: () => checkTable('site_text_blocks') },
  { id: '033', label: 'faqs table', run: () => checkTable('faqs') },
  { id: '034', label: 'message_templates table', run: () => checkTable('message_templates') },
  { id: '037', label: 'users.stripe_customer_id', run: () => checkColumn('users', 'stripe_customer_id') },
  { id: '038', label: 'users.last_seen_at', run: () => checkColumn('users', 'last_seen_at') },
  { id: '039', label: 'expert_profiles.search_vector', run: () => checkColumn('expert_profiles', 'search_vector') },
  { id: '040', label: 'rpc search_experts_keyword', run: () => checkRpc('search_experts_keyword', { p_q: '' }) },
  { id: '041', label: 'search_query_expansion_cache', run: () => checkTable('search_query_expansion_cache') },
  { id: '042', label: 'rpc search_experts_keyword has boost args', run: () => checkRpc('search_experts_keyword', { p_q: '', p_boost_category_ids: null, p_category_boost: 0.15 }) },
  { id: '043', label: 'rpc recompute_user_dependability_ratings', run: () => checkRpc('recompute_user_dependability_ratings', { p_user_id: '00000000-0000-0000-0000-000000000000' }) },
  { id: '044', label: 'help_tickets table', run: () => checkTable('help_tickets') },
  { id: '044', label: 'help_ticket_messages table', run: () => checkTable('help_ticket_messages') },
  { id: '045', label: 'rpc rewrite_storage_hostname', run: () => checkRpc('rewrite_storage_hostname', { p_old_host: 'a', p_new_host: 'b' }) },
  { id: '046+047', label: 'freelance_work.completion_message', run: () => checkColumn('freelance_work', 'completion_message') },
  { id: '046+047', label: 'freelance_work.payout_released_at', run: () => checkColumn('freelance_work', 'payout_released_at') },
  { id: '047', label: 'rpc freelance_compute_sla', run: () => checkRpc('freelance_compute_sla', {
      p_status: 'offered', p_work_deadline: null, p_completion_submitted_at: null, p_admin_review_at: null }) },
  { id: '048', label: 'request_upvotes table', run: () => checkTable('request_upvotes') },
  { id: '048', label: 'requests.upvote_count', run: () => checkColumn('requests', 'upvote_count') },
  { id: '049', label: 'message_templates row help_ticket_reply', run: () => checkRow('message_templates', { automation_key: 'help_ticket_reply' }) },
  { id: '049', label: 'message_templates row expert_registration_welcome', run: () => checkRow('message_templates', { automation_key: 'expert_registration_welcome' }) },
]

let pass = 0, fail = 0
for (const c of checks) {
  try {
    const r = await c.run()
    const tag = r.ok ? 'OK   ' : 'MISS '
    if (r.ok) pass++; else fail++
    console.log(`[${c.id}] ${tag} ${c.label} — ${r.detail}`)
  } catch (e) {
    fail++
    console.log(`[${c.id}] ERR  ${c.label} — ${e?.message ?? e}`)
  }
}
console.log(`\nPass: ${pass}   Miss/Err: ${fail}`)
