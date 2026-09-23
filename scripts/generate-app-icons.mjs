/**
 * Renders the installed app's icons from the logo in src/app/icon.svg (the favicon):
 *   public/icons/icon-192.png, icon-512.png   the logo as it is, for browsers and desktops
 *   public/icons/maskable-512.png             full-bleed, for Android to cut into its own shape
 *   src/app/apple-icon.png                    full-bleed 180px: iOS rounds the corners itself
 *
 * Re-run after changing the logo:
 *   node scripts/generate-app-icons.mjs
 *
 * Plain JavaScript on purpose: `next build` type-checks every .ts file, and sharp is only here
 * as Next.js's own optional dependency, so a missing copy must not be able to fail the build.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const LOGO = readFileSync(join(ROOT, "src", "app", "icon.svg"), "utf8");
const VIEWBOX = 32;

// The first fill is the logo's rounded backdrop: full-bleed icons paint its corners the same colour.
const backdrop = /fill="([^"]+)"/.exec(LOGO)?.[1];
if (!backdrop) throw new Error("No backdrop fill found in src/app/icon.svg");

async function render(file, size, { fullBleed = false } = {}) {
  // Rasterise the vector at the target size rather than scaling up a 32px bitmap.
  let image = sharp(Buffer.from(LOGO), { density: (72 * size) / VIEWBOX }).resize(size, size);
  if (fullBleed) image = image.flatten({ background: backdrop });
  const out = join(ROOT, file);
  mkdirSync(dirname(out), { recursive: true });
  await image.png({ compressionLevel: 9 }).toFile(out);
  console.log("✓", file);
}

await render("public/icons/icon-192.png", 192);
await render("public/icons/icon-512.png", 512);
await render("public/icons/maskable-512.png", 512, { fullBleed: true });
await render("src/app/apple-icon.png", 180, { fullBleed: true });
