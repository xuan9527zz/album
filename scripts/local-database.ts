import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { DB } from "../apps/api/src/handler";
export const demoUsers = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];
export async function localDatabase(): Promise<{ sql: PGlite; db: DB }> {
  const sql = new PGlite();
  await sql.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;`,
  );
  await sql.exec(
    await readFile(
      new URL("../supabase/migrations/202610120001_album.sql", import.meta.url),
      "utf8",
    ),
  );
  await sql.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610130001_shared_album_profiles.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await sql.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610130002_trash_batch_search.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await sql.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610130003_shared_comments.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await sql.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610130004_messages_likes_titles_push.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await sql.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610140001_story_albums.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await sql.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610140002_zine_templates.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await sql.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610140003_story_music_public.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await sql.exec(await readFile(new URL("../supabase/migrations/202610140004_photo_filenames.sql", import.meta.url), "utf8"));
  await sql.exec(await readFile(new URL("../supabase/migrations/202610150001_story_playback.sql", import.meta.url), "utf8"));
  for (const [index, user] of demoUsers.entries()) {
    await sql.query("insert into auth.users values($1)", [user]);
    await sql.query(
      "insert into public.profiles(user_id,display_name,is_active) values($1,$2,true)",
      [user, ["我的相册", "家人二", "家人三", "家人四"][index]],
    );
  }
  const db: DB = {
    async call(name, args) {
      if (
        ![
          "album_action",
          "album_v2_action",
          "album_v3_action",
          "album_v4_action",
          "album_v5_action",
          "album_v6_action",
          "album_v7_action",
          "album_v8_action",
          "album_v10_action",
          "album_story_public",
          "album_named_upload",
          "album_maintenance",
          "album_v3_maintenance",
        ].includes(name)
      )
        throw new Error("RPC_NOT_ALLOWED");
      const keys = Object.keys(args);
      const r = await sql.query<{ result: any }>(
        `select public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(",")}) as result`,
        Object.values(args).map((v) =>
          typeof v === "object" ? JSON.stringify(v) : v,
        ),
      );
      return r.rows[0].result;
    },
  };
  return { sql, db };
}
