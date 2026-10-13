import { it, expect } from "vitest";
import { localDatabase, demoUsers } from "../scripts/local-database";

it("keeps shared likes personal and delivers comment and chat notices", async () => {
  const { sql, db } = await localDatabase();
  const [owner, family] = demoUsers;
  try {
    const inserted = await sql.query<{ id: string; title: string }>(
      `insert into public.photos(owner_id,lifecycle_status,original_status,is_shared,source_metadata)
       values($1,'active','saved',true,$2::jsonb) returning id,title`,
      [owner, JSON.stringify({ title: "家人合照" })],
    );
    const photoID = inserted.rows[0].id;
    expect(inserted.rows[0].title).toBe("家人合照");

    const liked = await db.call("album_v5_action", { p_owner: family, p_action: "like", p_data: { photo_id: photoID, liked: true } });
    expect(liked).toMatchObject({ liked_by_me: true, like_count: 1 });
    const myFeatured = await db.call("album_v5_action", { p_owner: family, p_action: "list", p_data: { featured: true } });
    expect(myFeatured.photos.map((photo: { id: string }) => photo.id)).toEqual([photoID]);
    const ownerFeatured = await db.call("album_v5_action", { p_owner: owner, p_action: "list", p_data: { featured: true } });
    expect(ownerFeatured.photos).toEqual([]);
    let inbox = await db.call("album_v5_action", { p_owner: owner, p_action: "notifications", p_data: {} });
    expect(inbox.items.map((item: { kind: string }) => item.kind)).toEqual(["like"]);

    await db.call("album_v5_action", { p_owner: family, p_action: "like", p_data: { photo_id: photoID, liked: false } });
    inbox = await db.call("album_v5_action", { p_owner: owner, p_action: "notifications", p_data: {} });
    expect(inbox.items).toEqual([]);
    await db.call("album_v4_action", { p_owner: family, p_action: "add", p_data: { photo_id: photoID, body: "喜欢这张" } });
    await db.call("album_v5_action", { p_owner: family, p_action: "chat_send", p_data: { body: "大家好" } });
    inbox = await db.call("album_v5_action", { p_owner: owner, p_action: "notifications", p_data: {} });
    expect(inbox.unread_count).toBe(2);
    expect(inbox.items.map((item: { kind: string }) => item.kind)).toEqual(["chat", "comment"]);
    const chat = await db.call("album_v5_action", { p_owner: owner, p_action: "chat_list", p_data: {} });
    expect(chat.messages[0].body).toBe("大家好");
    await db.call("album_v5_action", { p_owner: owner, p_action: "notifications_read", p_data: {} });
    inbox = await db.call("album_v5_action", { p_owner: owner, p_action: "notifications", p_data: {} });
    expect(inbox.unread_count).toBe(0);

    const edited = await db.call("album_v5_action", { p_owner: owner, p_action: "edit", p_data: {
      photo_id: photoID, metadata: { title: "新的标题", location_label: "海边" },
    } });
    expect(edited).toMatchObject({ title: "新的标题", location_label: "海边" });
  } finally { await sql.close(); }
});
