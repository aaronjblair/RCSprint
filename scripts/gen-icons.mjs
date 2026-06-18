// Generate PWA / Apple / installer icon PNGs from the SUPER JAY #32 badge.
// All icons are square, on the night-colored background (#0a0c10) so they read
// against dark OS launchers. Run with `npm run icons`.
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SRC = path.join(root, "public", "superjay-32.png");
const PUB = path.join(root, "public");
const BG = "#0a0c10";

/**
 * Render the badge centered on a square night-colored canvas.
 * @param {number} size  output square edge in px
 * @param {string} out   output filename (under public/)
 * @param {number} scale fraction of the canvas the logo should occupy (1 = fill)
 */
async function make(size, out, scale = 1) {
  const inner = Math.round(size * scale);
  // Resize the logo to `inner`, contained on a transparent box, then flatten
  // onto the night background and extend out to the full square if padded.
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: BG })
    .flatten({ background: BG })
    .toBuffer();

  const pad = Math.round((size - inner) / 2);
  await sharp({
    create: { width: size, height: size, channels: 3, background: BG },
  })
    .composite([{ input: logo, top: pad, left: pad }])
    .png()
    .toFile(path.join(PUB, out));
  console.log(`  ${out}  (${size}x${size}, logo ${Math.round(scale * 100)}%)`);
}

console.log("Generating icons from", SRC);
await make(192, "pwa-192.png");
await make(512, "pwa-512.png");
// Maskable: shrink to ~80% so the safe zone clears Android's circular/squircle mask.
await make(512, "pwa-maskable-512.png", 0.8);
await make(180, "apple-touch-icon-180.png");
console.log("Done.");
