const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const svgPath = path.join(root, "public", "icon.svg");
const outDir = path.join(root, "public", "icons");
const svg = fs.readFileSync(svgPath);

fs.mkdirSync(outDir, { recursive: true });

async function writeMaskable(size, fileName) {
  const pad = Math.round(size * 0.12);
  const inner = size - pad * 2;
  const pig = await sharp(svg)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 245, b: 243, alpha: 1 },
    },
  })
    .composite([{ input: pig, left: pad, top: pad }])
    .png()
    .toFile(path.join(outDir, fileName));
}

(async () => {
  await writeMaskable(192, "pwa-192.png");
  await writeMaskable(512, "pwa-512.png");
  console.log(`Wrote ${path.join(outDir, "pwa-192.png")} and pwa-512.png`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
