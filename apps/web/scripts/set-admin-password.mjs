// One-off: create the ADMIN_EMAIL auth user (or update its password) using
// SUPABASE_SERVICE_ROLE_KEY. Usage:
//   node apps/web/scripts/set-admin-password.mjs <password>
// or with $ADMIN_PASSWORD set in the environment:
//   ADMIN_PASSWORD='...' node apps/web/scripts/set-admin-password.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const filePath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(filePath)) {
    console.error("Missing apps/web/.env.local");
    process.exit(1);
  }
  const txt = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of txt.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmail = env.ADMIN_EMAIL?.trim();
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  if (!adminEmail) {
    console.error("Missing ADMIN_EMAIL in .env.local");
    process.exit(1);
  }

  const password = process.argv[2] || process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error(
      "Usage: node apps/web/scripts/set-admin-password.mjs <password>\n" +
        "       (or set ADMIN_PASSWORD env var)"
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Find existing auth user by email (listUsers is paginated; we scan the first pages).
  let existingUser = null;
  let page = 1;
  const perPage = 1000;
  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("Failed to list users:", error.message);
      process.exit(1);
    }
    existingUser = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === adminEmail.toLowerCase()
    );
    if (existingUser) break;
    if (data.users.length < perPage) break;
    page += 1;
  }

  if (existingUser) {
    const { error } = await admin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.error("Failed to update user password:", error.message);
      process.exit(1);
    }
    console.log(`Updated password for existing auth user ${adminEmail} (id=${existingUser.id}).`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
    });
    if (error) {
      console.error("Failed to create auth user:", error.message);
      process.exit(1);
    }
    console.log(`Created auth user ${adminEmail} (id=${data.user?.id}).`);
  }

  console.log("Done. You can now sign in at http://localhost:3000/admin.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
