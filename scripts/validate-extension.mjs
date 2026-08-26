import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzePostText, countGraphemes, createReplyDraft } from "../extension/analyzer.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(projectRoot, "extension");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? listFiles(path.join(directory, entry.name), relative) : [relative];
  }));
  return nested.flat();
}

const manifest = JSON.parse(await readFile(path.join(extensionRoot, "manifest.json"), "utf8"));
assert(manifest.manifest_version === 3, "Extension must use Manifest V3.");
assert(manifest.version === "1.2.0", "Manifest and release version must match.");
assert(JSON.stringify(manifest.permissions) === JSON.stringify(["activeTab", "scripting"]), "Unexpected Chrome permissions.");
assert(!manifest.host_permissions, "Host permissions are not allowed.");
assert(!manifest.background && !manifest.content_scripts, "Background or persistent content scripts are not allowed.");
assert(manifest.action?.default_popup === "popup.html", "Popup entry point is missing.");
assert(
  manifest.content_security_policy?.extension_pages === "default-src 'none'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; connect-src 'none'",
  "Extension CSP must match the audited offline policy.",
);

const popup = await readFile(path.join(extensionRoot, "popup.html"), "utf8");
assert(!/<script(?![^>]*\bsrc=)[^>]*>/iu.test(popup), "Inline scripts are not allowed.");
assert(!/<script[^>]+src=["']https?:/iu.test(popup), "Remote scripts are not allowed.");

const popupScript = await readFile(path.join(extensionRoot, "popup.mjs"), "utf8");
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket)\b/u.test(popupScript), "Extension analysis must not make network requests.");
assert(!/sendBeacon\s*\(/u.test(popupScript), "Extension analysis must not send beacons.");

const files = await listFiles(extensionRoot);
for (const filename of files) {
  assert(!/(^|[\\/])\.env(?:\.|$)/iu.test(filename), `${filename} is an environment file.`);
  assert(!/\.(?:pem|key|map)$/iu.test(filename), `${filename} is not allowed in the extension package.`);
  assert(/\.(?:html|css|mjs|json|md)$/iu.test(filename), `${filename} has an unaudited file type.`);
  const contents = await readFile(path.join(extensionRoot, filename), "utf8");
  assert(!contents.includes("OPENAI_API_KEY"), `${filename} must not reference server secrets.`);
  assert(!/sk-[A-Za-z0-9_-]{20,}/u.test(contents), `${filename} contains a secret-shaped value.`);
  if (/\.mjs$/iu.test(filename)) {
    assert(!/\b(?:fetch|XMLHttpRequest|WebSocket)\b/u.test(contents), `${filename} must not make network requests.`);
    assert(!/sendBeacon\s*\(/u.test(contents), `${filename} must not send beacons.`);
  }
  if (/\.css$/iu.test(filename)) assert(!/url\s*\(\s*["']?https?:|@import/iu.test(contents), `${filename} must not load remote styles.`);
}

const draft = createReplyDraft(analyzePostText("這個功能應該怎麼設計？"));
assert(draft.includes("（本機草稿）"), "Draft must disclose that it is locally generated.");
assert(countGraphemes(draft) <= 100, "Draft exceeds the 100-grapheme limit.");

console.log(`Chrome extension validation passed (${files.length} files, ${manifest.permissions.length} permissions).`);
