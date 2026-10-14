import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const publicMusic = JSON.parse(
  readFileSync(new URL("../config/public-music.json", import.meta.url), "utf8"),
).files;
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const files = [...tracked];
let failed = false;
for (const file of files) {
  if (
    /(^|\/)(\.dev\.vars|\.env(?!\.example)|\.local|test-results)(\/|$)/.test(
      file,
    )
  ) {
    console.error(`Private path tracked: ${file}`);
    failed = true;
  }
  if (
    /\.(png|heic|jpg|jpeg)$/i.test(file) &&
    !file.startsWith("tests/fixtures/") &&
    !file.startsWith("apps/web/public/icons/")
  ) {
    console.error(`Unexpected image path: ${file}`);
    failed = true;
  }
  if (/\.(mp3|wav)$/i.test(file) && !file.startsWith("tests/fixtures/")) {
    const approved = publicMusic[file];
    const bytes = readFileSync(file);
    if (
      !approved ||
      bytes.length !== approved.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== approved.sha256
    ) {
      console.error(`Unexpected audio path or contents: ${file}`);
      failed = true;
    }
  }
  if (/\.(png|heic|mp3|wav)$/i.test(file)) continue;
  const source = readFileSync(file, "utf8");
  if (
    /sb_secret_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|X-Amz-Signature=[a-f0-9]{64}/.test(
      source,
    )
  ) {
    console.error(`Possible secret or signed URL: ${file}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`Private artifact scan passed (${files.length} tracked files).`);
