export interface MusicStore {
  upload(id: string, file: File): Promise<number>;
  read(asset: number, range?: string | null): Promise<Response>;
  remove(asset: number): Promise<void>;
  reconcile?(protectedAssets: number[]): Promise<void>;
}

export class GitHubMusicStore implements MusicStore {
  private release?: Promise<number>;
  private repo = "xuan9527zz/album";
  private tag = "album-bgm";
  constructor(
    private token: string,
    private upstream: typeof fetch = (...args) => fetch(...args),
  ) {}
  private headers(accept = "application/vnd.github+json") {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: accept,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "WeiweiAlbumMusic",
    };
  }
  private async releaseID() {
    if (!this.release)
      this.release = (async () => {
        const url = `https://api.github.com/repos/${this.repo}/releases`;
        let response = await this.upstream(`${url}/tags/${this.tag}`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(30000),
        });
        if (response.status === 404)
          response = await this.upstream(url, {
            method: "POST",
            headers: { ...this.headers(), "Content-Type": "application/json" },
            body: JSON.stringify({
              tag_name: this.tag,
              target_commitish: "main",
              name: "Album temporary BGM",
              body: "User-uploaded MP3 files expire after 72 hours and are removed automatically.",
              draft: false,
              prerelease: true,
              make_latest: "false",
            }),
            signal: AbortSignal.timeout(30000),
          });
        if (response.status === 422)
          response = await this.upstream(`${url}/tags/${this.tag}`, {
            headers: this.headers(),
            signal: AbortSignal.timeout(30000),
          });
        if (!response.ok) throw new Error("MUSIC_STORAGE_UNAVAILABLE");
        const data = (await response.json()) as { id: number };
        if (!Number.isSafeInteger(data.id) || data.id <= 0)
          throw new Error("MUSIC_STORAGE_UNAVAILABLE");
        return data.id;
      })().catch((error) => {
        this.release = undefined;
        throw error;
      });
    return this.release;
  }
  async upload(id: string, file: File) {
    const release = await this.releaseID();
    const response = await this.upstream(
      `https://uploads.github.com/repos/${this.repo}/releases/${release}/assets?name=${id}.mp3`,
      {
        method: "POST",
        headers: {
          ...this.headers(),
          "Content-Type": "audio/mpeg",
          "Content-Length": String(file.size),
        },
        body: file,
        signal: AbortSignal.timeout(180000),
      },
    );
    if (!response.ok) throw new Error("MUSIC_STORAGE_UNAVAILABLE");
    const data = (await response.json()) as {
      id: number;
      size: number;
      state: string;
      name: string;
    };
    if (
      !Number.isSafeInteger(data.id) ||
      data.id <= 0 ||
      data.size !== file.size ||
      data.state !== "uploaded" ||
      data.name !== `${id}.mp3`
    ) {
      if (Number.isSafeInteger(data.id) && data.id > 0)
        await this.remove(data.id);
      throw new Error("MUSIC_STORAGE_UNAVAILABLE");
    }
    return data.id;
  }
  async read(asset: number, range?: string | null) {
    const headers = new Headers(this.headers("application/octet-stream"));
    if (range) headers.set("Range", range);
    const response = await this.upstream(
      `https://api.github.com/repos/${this.repo}/releases/assets/${asset}`,
      { headers, redirect: "manual", signal: AbortSignal.timeout(180000) },
    );
    if (response.status !== 302) return response;
    const redirect = new URL(response.headers.get("Location") || "");
    if (
      redirect.protocol !== "https:" ||
      ![
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
      ].includes(redirect.hostname)
    )
      throw new Error("MUSIC_STORAGE_UNAVAILABLE");
    const mediaHeaders = new Headers();
    if (range) mediaHeaders.set("Range", range);
    return this.upstream(redirect.toString(), {
      headers: mediaHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(180000),
    });
  }
  async remove(asset: number) {
    const response = await this.upstream(
      `https://api.github.com/repos/${this.repo}/releases/assets/${asset}`,
      {
        method: "DELETE",
        headers: this.headers(),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok && response.status !== 404)
      throw new Error("MUSIC_STORAGE_UNAVAILABLE");
  }
  async reconcile(protectedAssets: number[]) {
    const release = await this.releaseID();
    const assets: Array<{
      id: number;
      name: string;
      created_at: string;
    }> = [];
    // Collect all pages before deleting, so removals cannot shift the next page.
    for (let page = 1; ; page++) {
      const response = await this.upstream(
        `https://api.github.com/repos/${this.repo}/releases/${release}/assets?per_page=100&page=${page}`,
        { headers: this.headers(), signal: AbortSignal.timeout(30000) },
      );
      if (!response.ok) throw new Error("MUSIC_STORAGE_UNAVAILABLE");
      const batch = (await response.json()) as typeof assets;
      assets.push(...batch);
      if (batch.length < 100) break;
    }
    const cutoff = Date.now() - 72 * 3600000,
      known = new Set(protectedAssets);
    for (const asset of assets)
      if (
        Number.isSafeInteger(asset.id) &&
        asset.id > 0 &&
        !known.has(asset.id) &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp3$/.test(
          asset.name,
        ) &&
        new Date(asset.created_at).getTime() <= cutoff
      )
        await this.remove(asset.id);
  }
}
