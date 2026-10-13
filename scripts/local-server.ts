import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { localDatabase, demoUsers } from "./local-database";
import { LocalStore } from "./local-store";
import { createHandler, cleanUp } from "../apps/api/src/handler";
async function main() {
  const { sql, db } = await localDatabase();
  const store = new LocalStore();
  const handler = createHandler({
    db,
    store,
    origins: ["http://127.0.0.1:5173"],
    uploadTTL: 600,
    readTTL: 300,
    async authenticate(token) {
      const user = token.startsWith("demo:") ? token.slice(5) : "";
      return demoUsers.includes(user) ? user : null;
    },
  });
  for (const [userIndex, user] of demoUsers.entries())
    for (let n = 0; n < (userIndex === 0 ? 12 : 3); n++) {
      const body = new Uint8Array(
        await readFile(
          new URL(`../tests/fixtures/landscape-${n % 6}.png`, import.meta.url),
        ),
      );
      const spec = {
        role: "original_image",
        filename: `示例风景-${n}.png`,
        size: body.length,
        mime: "image/png",
        md5: createHash("md5").update(body).digest("base64"),
        sha256: createHash("sha256").update(body).digest("hex"),
        provenance: "file_imported",
      };
      const assets = [
        spec,
        { ...spec, role: "preview", filename: "preview.png" },
        { ...spec, role: "thumbnail", filename: "thumbnail.png" },
      ];
      const meta = {
        date_source: "manual",
        captured_local: `2026-${n < 6 ? "10" : "09"}-${String(11 - (n % 6)).padStart(2, "0")}T16:24:00`,
        location_label: [
          "沿着海岸走走",
          "山间的风",
          "黄昏，有点温柔",
          "在绿色里呼吸",
          "远方的山",
          "午后的光",
        ][n % 6],
        location_source: "manual",
        is_featured: n % 3 !== 2,
      };
      const s = await db.call("album_action", {
        p_owner: user,
        p_action: "init",
        p_data: {
          assets,
          metadata: meta,
          key: `synthetic-seed-${userIndex}-${n}`,
          digest: String(n),
        },
      });
      const items = await db.call("album_action", {
        p_owner: user,
        p_action: "grants",
        p_data: { session_id: s.id, ttl: 0 },
      });
      for (const i of items) {
        store.objects.set(i.object_key, {
          body,
          mime: "image/png",
          etag: createHash("md5").update(body).digest("hex"),
        });
        await db.call("album_action", {
          p_owner: user,
          p_action: "complete",
          p_data: {
            session_id: s.id,
            item_id: i.id,
            etag: createHash("md5").update(body).digest("hex"),
          },
        });
      }
    }
  await sql.exec("truncate public.request_limits");
  const server = createServer(async (req, res) => {
    try {
      // Each browser test starts with a fresh rate window; the demo API never runs in production.
      if (req.method === "POST" && req.url === "/__test/reset-request-limits") {
        await sql.exec("truncate public.request_limits");
        res.writeHead(204);
        res.end();
        return;
      }
      const url = `http://127.0.0.1:8788${req.url}`;
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 129 * 1024 ** 2) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(chunk);
      }
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      });
      const result = req.url?.startsWith("/local-object/")
        ? await store.fetch(request)
        : await handler(request);
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      res.writeHead(503);
      res.end("Local service unavailable");
    }
  });
  await new Promise<void>((resolve) =>
    server.listen(8788, "127.0.0.1", resolve),
  );
  console.log(
    "Local API: http://127.0.0.1:8788 — explicit demo, synthetic photos, memory-only database",
  );
  const timer = setInterval(() => {
    cleanUp(db, store, false).catch(() => {});
  }, 60_000);
  const vite = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
    {
      env: {
        ...process.env,
        VITE_LOCAL_DEMO: "true",
        VITE_API_BASE_URL: "http://127.0.0.1:8788",
      },
      stdio: "inherit",
    },
  );
  const stop = () => {
    clearInterval(timer);
    vite.kill();
    server.close();
    sql.close();
  };
  process.on("SIGINT", () => {
    stop();
    process.exit();
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit();
  });
  vite.on("exit", () => {
    stop();
    process.exit();
  });
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Local startup failed");
  process.exit(1);
});
