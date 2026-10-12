import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
const env = process.env;
if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
  throw new Error("Missing private backup configuration");
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const snapshot: Record<string, unknown[]> = {};
for (const table of [
  "profiles",
  "photos",
  "photo_assets",
  "upload_sessions",
  "upload_items",
  "storage_budget",
]) {
  const items: unknown[] = [];
  let page = 0;
  while (true) {
    const r = await client
      .from(table)
      .select("*")
      .order(table === "profiles" ? "user_id" : "id")
      .range(page * 500, (page + 1) * 500 - 1);
    if (r.error) throw new Error("Backup failed; verify private configuration");
    items.push(...r.data);
    if (r.data.length < 500) break;
    page++;
    if (page > 1000) throw new Error("Backup pagination limit");
  }
  snapshot[table] = items;
}
await mkdir(".local/backups", { recursive: true });
const filename = `.local/backups/records-${Date.now()}.json`;
await writeFile(filename, JSON.stringify(snapshot));
console.log(
  "Record backup saved under ignored .local/backups. Keep this private; object files must be backed up separately.",
);
