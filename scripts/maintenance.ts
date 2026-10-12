import { productionDependencies, type Env } from "../apps/api/src/index";
import { cleanUp } from "../apps/api/src/handler";
async function main() {
  const env = process.env as unknown as Env;
  if (!env.SUPABASE_SECRET_KEY || !env.R2_SECRET_ACCESS_KEY)
    throw new Error("缺少后台维护配置");
  const d = productionDependencies(env);
  const operation = process.argv[2] || "cleanup";
  if (operation === "cleanup") {
    console.log(
      JSON.stringify(
        await cleanUp(d.db, d.store, !process.argv.includes("--apply")),
      ),
    );
    return;
  }
  if (operation === "reconcile") {
    const inventory = await d.db.call("album_maintenance", {
      p_action: "inventory",
      p_data: {},
    });
    const expected = new Map<string, number>(
      [...inventory.assets, ...inventory.pending].map((i: any) => [
        i.key,
        Number(i.bytes),
      ]),
    );
    let actual = 0,
      objects = 0,
      orphanBytes = 0,
      orphanCount = 0;
    for await (const o of d.store.list()) {
      actual += o.size;
      objects++;
      if (!expected.has(o.key)) {
        orphanBytes += o.size;
        orphanCount++;
      }
      expected.delete(o.key);
    }
    const committedKeys = new Set(inventory.assets.map((i: any) => i.key));
    const missing = [...expected.keys()].filter((k) =>
      committedKeys.has(k),
    ).length;
    console.log(
      JSON.stringify({
        objects,
        actual_bytes: actual,
        committed_bytes: inventory.budget.committed_bytes,
        reserved_bytes: inventory.budget.reserved_bytes,
        unregistered_objects: orphanCount,
        unregistered_bytes: orphanBytes,
        missing_committed_objects: missing,
      }),
    );
    // A difference report is never an instruction to delete objects or rewrite the ledger.
    return;
  }
  throw new Error("用法：maintenance -- cleanup [--apply] | reconcile");
}
main().catch(() => {
  console.error("维护未完成；请核对安全配置与服务可用性，不自动修改容量账本。");
  process.exit(1);
});
