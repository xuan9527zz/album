import { afterEach, expect, it } from "vitest";
import { localDatabase, demoUsers } from "../scripts/local-database";

const opened: Array<Awaited<ReturnType<typeof localDatabase>>> = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map(({ sql }) => sql.close()));
});

it("keeps private stories private and only shares frames that are still shared", async () => {
  const setup = await localDatabase();
  opened.push(setup);
  const [owner, family] = demoUsers;
  const photos: string[] = [];
  for (const isShared of [true, true, false]) {
    const result = await setup.sql.query<{ id: string }>(
      "insert into public.photos(owner_id,lifecycle_status,original_status,is_shared) values($1,'active','saved',$2) returning id",
      [owner, isShared],
    );
    photos.push(result.rows[0].id);
  }
  const action = (
    user: string,
    verb: string,
    data: Record<string, unknown> = {},
  ) =>
    setup.db.call("album_v6_action", {
      p_owner: user,
      p_action: verb,
      p_data: data,
    });
  const privateStory = await action(owner, "create", {
    title: "东京",
    template: "journal",
    transition: "slide",
    is_shared: false,
    photo_ids: [photos[0], photos[2]],
  });
  expect(privateStory.photos.map((photo: { id: string }) => photo.id)).toEqual([
    photos[0],
    photos[2],
  ]);
  await expect(
    action(family, "detail", { story_id: privateStory.id }),
  ).rejects.toThrow("NOT_FOUND");
  await expect(
    action(owner, "create", {
      title: "不能共享私人照片",
      template: "journal",
      transition: "slide",
      is_shared: true,
      photo_ids: [photos[0], photos[2]],
    }),
  ).rejects.toThrow("NOT_FOUND");
  const shared = await action(owner, "create", {
    title: "一起看",
    template: "cinema",
    transition: "fade",
    is_shared: true,
    photo_ids: [photos[1], photos[0]],
  });
  expect(
    (await action(family, "detail", { story_id: shared.id })).photos.map(
      (p: { id: string }) => p.id,
    ),
  ).toEqual([photos[1], photos[0]]);
  await setup.sql.query(
    "update public.photos set is_shared=false where id=$1",
    [photos[0]],
  );
  expect(
    (await action(family, "detail", { story_id: shared.id })).photos.map(
      (p: { id: string }) => p.id,
    ),
  ).toEqual([photos[1]]);
  expect(
    (await action(owner, "detail", { story_id: shared.id })).photos,
  ).toHaveLength(2);
  await expect(
    action(family, "delete", { story_id: shared.id }),
  ).rejects.toThrow("NOT_FOUND");
  await setup.sql.query(
    "update public.photos set is_shared=false where id=$1",
    [photos[1]],
  );
  await expect(
    action(family, "detail", { story_id: shared.id }),
  ).rejects.toThrow("NOT_FOUND");
  expect((await action(family, "list")).stories).toHaveLength(0);
  await action(owner, "delete", { story_id: shared.id });
  await expect(
    action(owner, "detail", { story_id: shared.id }),
  ).rejects.toThrow("NOT_FOUND");
});

it("updates photo order atomically and removes frames when a photo is purged", async () => {
  const setup = await localDatabase();
  opened.push(setup);
  const owner = demoUsers[0];
  const photos: string[] = [];
  for (let index = 0; index < 3; index++) {
    const result = await setup.sql.query<{ id: string }>(
      "insert into public.photos(owner_id,lifecycle_status,original_status) values($1,'active','saved') returning id",
      [owner],
    );
    photos.push(result.rows[0].id);
  }
  const action = (verb: string, data: Record<string, unknown>) =>
    setup.db.call("album_v6_action", {
      p_owner: owner,
      p_action: verb,
      p_data: data,
    });
  const story = await action("create", {
    title: "顺序",
    template: "journal",
    transition: "slide",
    is_shared: false,
    photo_ids: photos,
  });
  const edited = await action("update", {
    story_id: story.id,
    title: "新顺序",
    template: "postcard",
    transition: "zoom",
    is_shared: false,
    photo_ids: [photos[2], photos[0]],
  });
  expect(edited.photos.map((p: { id: string }) => p.id)).toEqual([
    photos[2],
    photos[0],
  ]);
  expect(edited.template).toBe("postcard");
  await setup.sql.query("delete from public.photos where id=$1", [photos[2]]);
  expect(
    (await action("detail", { story_id: story.id })).photos.map(
      (p: { id: string }) => p.id,
    ),
  ).toEqual([photos[0]]);
});
