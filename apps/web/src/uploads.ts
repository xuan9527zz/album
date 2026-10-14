import type {
  AssetSpec,
  Grant,
  Metadata,
  UploadSession,
} from "../../../packages/shared/src/index";
import { Client } from "./client";
import { derivatives, metadata, specification } from "./files";
export function journal(client: Client): string[] {
  try {
    return JSON.parse(
      sessionStorage.getItem(`album-pending:${client.userID}`) || "[]",
    );
  } catch {
    return [];
  }
}
function remember(client: Client, id: string, remove = false) {
  const ids = journal(client).filter((x) => x !== id);
  if (!remove) ids.push(id);
  sessionStorage.setItem(`album-pending:${client.userID}`, JSON.stringify(ids));
}
export async function put(
  blob: Blob,
  grant: Grant,
  signal: AbortSignal,
  progress: (n: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", grant.url);
    for (const [k, v] of Object.entries(grant.headers))
      xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(e.loaded / e.total);
    };
    const done = () => signal.removeEventListener("abort", abort);
    xhr.onload = () => {
      done();
      (xhr.status >= 200 && xhr.status < 300) || xhr.status === 412
        ? resolve()
        : reject(new Error("文件上传失败，请重试"));
    };
    xhr.onerror = () => {
      done();
      reject(new Error("网络中断或授权过期，请重试"));
    };
    xhr.onabort = () => {
      done();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    xhr.send(blob);
  });
}
async function transfer(
  client: Client,
  session: UploadSession,
  grants: Grant[],
  files: Map<string, Blob>,
  progress: (text: string, n: number) => void,
) {
  for (const [index, item] of session.items.entries()) {
    if (item.state === "committed") continue;
    const file = files.get(item.role);
    if (!file) throw new Error("请重新选择未完成素材");
    let grant = grants.find((g) => g.asset_id === item.id);
    if (!grant)
      grant = (
        await client.request<{ grants: Grant[] }>(
          `/v1/uploads/${session.id}/refresh`,
          {},
        )
      ).grants.find((g) => g.asset_id === item.id);
    if (!grant) continue;
    await put(file, grant, client.controller.signal, (n) =>
      progress(
        item.role === "original_image"
          ? "保存原件"
          : item.role === "live_video"
            ? "保存配套视频"
            : "保存浏览图片",
        (index + n) / session.items.length,
      ),
    );
    await client.request(
      `/v1/uploads/${session.id}/assets/${item.id}/complete`,
      {},
    );
  }
  remember(client, session.id, true);
}
export async function uploadPhoto(
  client: Client,
  file: File,
  video: File | undefined,
  provenance: AssetSpec["provenance"],
  key: string,
  featured: boolean,
  shared: boolean,
  details: { title: string; date: string; place: string },
  progress: (text: string, n: number) => void,
  allocated?: (session: UploadSession) => void,
) {
  progress("读取拍摄信息与校验原件", 0);
  const meta = await metadata(file);
  meta.title = details.title.trim() || null;
  meta.captured_local = details.date || null;
  meta.date_source = details.date ? "manual" : "unknown";
  meta.location_label = details.place.trim() || null;
  meta.location_source = details.place.trim() ? "manual" : "unknown";
  meta.is_featured = featured;
  const original = await specification(
    file,
    "original_image",
    provenance,
    client.controller.signal,
  );
  const assets = [original];
  if (video)
    assets.push(
      await specification(
        video,
        "live_video",
        provenance,
        client.controller.signal,
      ),
    );
  const result = await client.request<{
    session: UploadSession;
    grants: Grant[];
  }>("/v1/uploads/init", { assets, metadata: meta }, "POST", key);
  remember(client, result.session.id);
  allocated?.(result.session);
  await transfer(
    client,
    result.session,
    result.grants,
    new Map([
      ["original_image", file],
      ...(video ? [["live_video", video] as [string, Blob]] : []),
    ]),
    progress,
  );
  progress("原件已保存，生成浏览图片", 1);
  try {
    await addDerivatives(
      client,
      result.session.photo_id,
      file,
      key + "-preview",
      progress,
    );
  } catch (e) {
    if (client.controller.signal.aborted) throw e;
    throw new Error(
      `原件已保存；${e instanceof Error ? e.message : "浏览图片生成失败"}。到全部照片中补传预览。`,
    );
  }
  if (shared) {
    try {
      await client.request(`/v1/photos/${result.session.photo_id}/share`, { is_shared: true });
    } catch {
      throw new Error("照片已保存到个人相册，但共享失败。请到“全部照片”打开该照片，再选择放入共享相册。");
    }
  }
  return result.session.photo_id;
}
export async function addDerivatives(
  client: Client,
  photoID: string,
  file: File,
  key: string,
  progress: (text: string, n: number) => void,
) {
  const outputs = await derivatives(file, client.controller.signal);
  const assets: AssetSpec[] = [];
  const files = new Map<string, Blob>();
  for (const out of outputs) {
    const derived = new File([out.blob], `${out.role}.jpg`, {
      type: "image/jpeg",
    });
    assets.push({
      ...(await specification(
        derived,
        out.role,
        "file_imported",
        client.controller.signal,
      )),
      width: out.width,
      height: out.height,
    });
    files.set(out.role, derived);
  }
  const result = await client.request<{
    session: UploadSession;
    grants: Grant[];
  }>(
    `/v1/photos/${photoID}/assets/init`,
    {
      assets,
      metadata: {
        date_source: "unknown",
        location_source: "unknown",
        is_featured: false,
      },
    },
    "POST",
    key,
  );
  remember(client, result.session.id);
  await transfer(client, result.session, result.grants, files, progress);
}
export async function resume(
  client: Client,
  session: UploadSession,
  files: File[],
  progress: (text: string, n: number) => void,
) {
  const matched = new Map<string, Blob>();
  for (const item of session.items.filter((i) => i.state === "pending")) {
    const file = files.find(
      (f) =>
        (f.name === (item.source_filename || item.original_filename) || f.name === item.original_filename) && f.size === Number(item.size_bytes),
    );
    if (!file) throw new Error(`请重新选择 ${item.source_filename || item.original_filename}`);
    const spec = await specification(
      file,
      item.role,
      "file_imported",
      client.controller.signal,
    );
    if (spec.sha256 !== item.sha256)
      throw new Error("重新选择的文件与已批准原件不一致");
    matched.set(item.role, file);
  }
  const grants = (
    await client.request<{ grants: Grant[] }>(
      `/v1/uploads/${session.id}/refresh`,
      {},
    )
  ).grants;
  await transfer(client, session, grants, matched, progress);
}
export async function cancel(client: Client, sessionID: string) {
  await client.request(`/v1/uploads/${sessionID}/cancel`, {});
  remember(client, sessionID, true);
}
export async function addLiveVideo(
  client: Client,
  photoID: string,
  file: File,
) {
  const spec = await specification(
    file,
    "live_video",
    "file_imported",
    client.controller.signal,
  );
  const result = await client.request<{
    session: UploadSession;
    grants: Grant[];
  }>(
    `/v1/photos/${photoID}/assets/init`,
    {
      assets: [spec],
      metadata: {
        date_source: "unknown",
        location_source: "unknown",
        is_featured: false,
      },
    },
    "POST",
    crypto.randomUUID(),
  );
  remember(client, result.session.id);
  await transfer(
    client,
    result.session,
    result.grants,
    new Map([["live_video", file]]),
    () => {},
  );
}
