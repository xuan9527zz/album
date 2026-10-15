import { z } from "zod";
import { audioTrack, audioTracks } from "./audio-tracks";

export const trackIdPattern = /^[1-9][0-9]{0,19}$/;
export const fileIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const musicGateway =
  "https://nqjdngemhgmahqjuuxwx.supabase.co/functions/v1/album-gateway";
export const musicInputSchema = z
  .object({
    provider: z.enum(["netease", "qq", "file"]),
    provider_track_id: z.string().max(36),
    enabled: z.boolean(),
    title: z.string().trim().max(100).nullable(),
    artist: z.string().trim().max(100).nullable(),
    schema_version: z.literal(1),
  })
  .strict()
  .refine(
    (music) =>
      music.provider === "file"
        ? !!audioTrack(music.provider_track_id) ||
          fileIdPattern.test(music.provider_track_id)
        : trackIdPattern.test(music.provider_track_id),
    { message: "配乐不存在" },
  );
export type MusicInput = z.infer<typeof musicInputSchema>;
export type MusicConfig = MusicInput & {
  source_url: string;
  expires_at?: string | null;
  expired?: boolean;
};
export const musicProviderName = {
  netease: "网易云音乐",
  qq: "QQ 音乐",
  file: "文件配乐",
};
export function musicSource(provider: MusicInput["provider"], id: string) {
  if (provider === "file") {
    const track = audioTrack(id);
    if (!track && fileIdPattern.test(id))
      return `${musicGateway}/v1/music/${id}/stream`;
    if (!track) throw new Error("配乐不存在");
    return track.url;
  }
  return provider === "netease"
    ? `https://music.163.com/song?id=${id}`
    : `https://i.y.qq.com/v8/playsong.html?songid=${id}&songtype=0`;
}
export function musicEmbed(music: MusicInput) {
  if (music.provider === "file") throw new Error("文件配乐使用原生播放器");
  const validated = musicInputSchema.parse({
    provider: music.provider,
    provider_track_id: music.provider_track_id,
    enabled: music.enabled,
    title: music.title,
    artist: music.artist,
    schema_version: music.schema_version,
  });
  const url = new URL(
    validated.provider === "netease"
      ? "https://music.163.com/outchain/player"
      : "https://i.y.qq.com/n2/m/outchain/player/index.html",
  );
  if (validated.provider === "netease") {
    url.search = new URLSearchParams({
      type: "2",
      id: validated.provider_track_id,
      auto: "0",
      height: "32",
    }).toString();
  } else
    url.search = new URLSearchParams({
      songid: validated.provider_track_id,
      songtype: "0",
    }).toString();
  return url.href;
}
type ParsedMusic =
  | {
      ok: true;
      provider: MusicInput["provider"];
      provider_track_id: string;
      source_url: string;
    }
  | { ok: false; code: string; message: string };
export function parseMusicUrl(input: string): ParsedMusic {
  const fail = (code: string, message: string): ParsedMusic => ({
    ok: false,
    code,
    message,
  });
  let url: URL;
  try {
    const value = input.trim();
    if (!value || value.length > 2048 || /\s/.test(value)) throw new Error();
    url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      throw new Error();
  } catch {
    return fail("INVALID_URL", "请粘贴完整的 HTTPS 单曲链接。");
  }
  const file = audioTracks.find((track) => track.url === url.href);
  const uploaded =
    url.origin === new URL(musicGateway).origin && !url.search && !url.hash
      ? url.pathname.match(
          /^\/functions\/v1\/album-gateway\/v1\/music\/([0-9a-f-]{36})\/stream$/,
        )
      : null;
  if (uploaded && fileIdPattern.test(uploaded[1]))
    return {
      ok: true,
      provider: "file",
      provider_track_id: uploaded[1],
      source_url: url.href,
    };
  if (file)
    return {
      ok: true,
      provider: "file",
      provider_track_id: file.id,
      source_url: file.url,
    };
  if (
    ["163cn.tv", "c6.y.qq.com", "y.music.163.com", "url.cn"].includes(
      url.hostname,
    )
  )
    return fail(
      "SHORT_LINK_NOT_SUPPORTED",
      "请先在浏览器打开分享链接，再复制含歌曲 ID 的完整链接。",
    );
  let provider: MusicInput["provider"], params: URLSearchParams, key: string;
  if (url.hostname === "music.163.com") {
    provider = "netease";
    key = "id";
    if (["/song", "/m/song"].includes(url.pathname) && !url.hash)
      params = url.searchParams;
    else if (url.pathname === "/" && url.hash.startsWith("#/song?")) {
      if (url.searchParams.has("id"))
        return fail("INVALID_TRACK_ID", "歌曲 ID 参数有重复或冲突。");
      params = new URLSearchParams(url.hash.slice(7));
    } else return fail("UNSUPPORTED_LINK", "请使用网易云音乐的完整单曲链接。");
  } else if (["i.y.qq.com", "y.qq.com"].includes(url.hostname)) {
    provider = "qq";
    key = "songid";
    if (url.searchParams.has("songmid") || url.hostname === "y.qq.com")
      return fail(
        "UNSUPPORTED_ID_KIND",
        "此 QQ 链接暂不支持，请使用包含数字 songid 的完整单曲链接。",
      );
    if (url.pathname !== "/v8/playsong.html" || url.hash)
      return fail("UNSUPPORTED_LINK", "请使用 QQ 音乐的完整单曲链接。");
    params = url.searchParams;
    if (
      params.getAll("songtype").length > 1 ||
      (params.has("songtype") && params.get("songtype") !== "0")
    )
      return fail("UNSUPPORTED_LINK", "目前只支持 QQ 音乐的单曲链接。");
    if (params.has("id"))
      return fail("INVALID_TRACK_ID", "歌曲 ID 参数有冲突。");
  } else
    return fail(
      "UNSUPPORTED_PROVIDER",
      "目前支持网易云音乐和 QQ 音乐的单曲链接。",
    );
  const id = params.get(key) || "";
  if (params.getAll(key).length !== 1 || !trackIdPattern.test(id))
    return fail("INVALID_TRACK_ID", "链接中的歌曲 ID 不正确或重复。");
  return {
    ok: true,
    provider,
    provider_track_id: id,
    source_url: musicSource(provider, id),
  };
}
