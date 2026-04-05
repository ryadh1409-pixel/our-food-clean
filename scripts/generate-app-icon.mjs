/**
 * HalfOrder app icon: flat blue field, white food + sharing mark.
 * Outputs Expo master + iOS size set + Android adaptive foreground.
 * Usage: npm run generate:app-icon
 */
import fs from 'node:fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const assetsRoot = join(root, 'assets');
const assetsImages = join(assetsRoot, 'images');
const iosOut = join(assetsRoot, 'icons', 'ios');

const BG = '#4A90E2';

/**
 * Centered white glyph: two overlapping disks (sharing / splitting one order).
 * Kept inside ~78% of canvas for iOS squircle safe area.
 */
const WHITE_MARK = `
  <g fill="#FFFFFF">
    <circle cx="418" cy="512" r="246"/>
    <circle cx="606" cy="512" r="246"/>
  </g>
`;

function svgFull() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="${BG}"/>
  ${WHITE_MARK}
</svg>`;
}

/** Android adaptive foreground: transparent, symbol only, scaled for ~66% safe circle. */
function svgForeground() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="none"/>
  <g transform="translate(512 512) scale(0.82) translate(-512 -512)">
    ${WHITE_MARK}
  </g>
</svg>`;
}

/** @param {{ flattenHex?: string }} [opts] — flatten removes alpha (required for App Store 1024 master). */
async function pngFromSvg(svgString, size, file, opts = {}) {
  await fs.mkdir(dirname(file), { recursive: true });
  let pipeline = sharp(Buffer.from(svgString)).resize(size, size);
  if (opts.flattenHex) {
    pipeline = pipeline.flatten({ background: opts.flattenHex });
  }
  await pipeline.png({ compressionLevel: 9 }).toFile(file);
}

async function main() {
  const full = svgFull();
  const fg = svgForeground();

  const master1024 = join(assetsRoot, 'icon.png');
  await pngFromSvg(full, 1024, master1024, { flattenHex: BG });
  console.log('Wrote assets/icon.png (1024 × 1024, opaque)');

  /** Mirror under images/ for any legacy paths or docs. */
  await pngFromSvg(full, 1024, join(assetsImages, 'icon.png'), {
    flattenHex: BG,
  });
  console.log('Wrote assets/images/icon.png (1024 × 1024, opaque)');

  await fs.mkdir(iosOut, { recursive: true });

  /** Common Xcode / marketing exports from same art. */
  const iosSizes = [
    ['Icon-20@2x.png', 40],
    ['Icon-20@3x.png', 60],
    ['Icon-29@2x.png', 58],
    ['Icon-29@3x.png', 87],
    ['Icon-40@2x.png', 80],
    ['Icon-40@3x.png', 120],
    ['Icon-60@2x.png', 120],
    ['Icon-60@3x.png', 180],
    ['Icon-1024.png', 1024],
  ];

  for (const [name, px] of iosSizes) {
    await pngFromSvg(full, px, join(iosOut, name), { flattenHex: BG });
  }
  console.log(`Wrote ${iosSizes.length} files to assets/icons/ios/`);

  await pngFromSvg(fg, 1024, join(assetsImages, 'app-icon-foreground.png'));
  console.log('Wrote assets/images/app-icon-foreground.png (Android adaptive foreground)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
