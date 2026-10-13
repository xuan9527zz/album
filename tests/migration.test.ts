import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

it("upgrades an existing private photo without sharing or deleting it", async () => {
  const db = new PGlite();
  const user = "11111111-1111-4111-8111-111111111111";
  try {
    await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;");
    for (const file of ["202610120001_album.sql", "202610130001_shared_album_profiles.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    }
    await db.query("insert into auth.users values($1)", [user]);
    await db.query("insert into public.profiles(user_id,display_name,is_active) values($1,'现有成员',true)", [user]);
    const before = await db.query<{ id: string }>("insert into public.photos(owner_id,lifecycle_status,original_status) values($1,'active','saved') returning id", [user]);
    await db.exec(await readFile(new URL("../supabase/migrations/202610130002_trash_batch_search.sql", import.meta.url), "utf8"));
    const after = await db.query<{ lifecycle_status: string; deleted_at: string | null; is_shared: boolean }>(
      "select lifecycle_status,deleted_at,is_shared from public.photos where id=$1", [before.rows[0].id]);
    expect(after.rows[0]).toMatchObject({ lifecycle_status: "active", deleted_at: null, is_shared: false });
    const listed = await db.query<{ result: { photos: { id: string }[] } }>(
      "select public.album_v3_action($1,'list','{}') as result", [user]);
    expect(listed.rows[0].result.photos.map((photo) => photo.id)).toEqual([before.rows[0].id]);
  } finally {
    await db.close();
  }
});
