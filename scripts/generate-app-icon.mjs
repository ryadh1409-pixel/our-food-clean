/**
 * HalfOrder app icon — minimal two hands sharing food (flat, App Store safe).
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
const HAND = '#FFFFFF';
const FOOD = '#FFBD59';

/**
 * ~155px margin — art stays inside squircle safe zone on 1024 canvas.
 */
const GLYPH = `
  <!-- Food: soft triangular “half share” (reads as pizza / offering) -->
  <path fill="${FOOD}" d="M 512 322 Q 388 508 512 572 Q 636 508 512 322 Z"/>

  <!-- Left hand: one cupped palm + three finger bars -->
  <path fill="${HAND}" d="
    M 268 588
    C 242 520 256 432 322 392
    C 382 358 448 392 468 452
    C 476 488 462 528 432 552
    C 412 566 396 578 388 608
    C 376 652 334 676 292 662
    C 252 648 248 616 268 588
    Z"/>
  <rect x="332" y="412" width="112" height="38" rx="19" transform="rotate(16 388 431)" fill="${HAND}"/>
  <rect x="348" y="458" width="120" height="38" rx="19" transform="rotate(6 408 477)" fill="${HAND}"/>
  <rect x="360" y="504" width="126" height="38" rx="19" transform="rotate(-4 423 523)" fill="${HAND}"/>

  <!-- Right hand: mirrored -->
  <g transform="translate(1024 0) scale(-1 1)">
    <path fill="${HAND}" d="
      M 268 588
      C 242 520 256 432 322 392
      C 382 358 448 392 468 452
      C 476 488 462 528 432 552
      C 412 566 396 578 388 608
      C 376 652 334 676 292 662
      C 252 648 248 616 268 588
      Z"/>
    <rect x="332" y="412" width="112" height="38" rx="19" transform="rotate(16 388 431)" fill="${HAND}"/>
    <rect x="348" y="458" width="120" height="38" rx="19" transform="rotate(6 408 477)" fill="${HAND}"/>
    <rect x="360" y="504" width="126" height="38" rx="19" transform="rotate(-4 423 523)" fill="${HAND}"/>
  </g>
`;

function svgFull() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="${BG}"/>
  ${GLYPH}
</svg>`;
}

function svgForeground() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="none"/>
  <g transform="translate(512 512) scale(0.82) translate(-512 -512)">
    ${GLYPH}
  </g>
</svg>`;
}

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

  await pngFromSvg(full, 1024, join(assetsRoot, 'icon.png'), { flattenHex: BG });
  console.log('Wrote assets/icon.png (1024 × 1024, opaque)');

  await pngFromSvg(full, 1024, join(assetsImages, 'icon.png'), {
    flattenHex: BG,
  });
  console.log('Wrote assets/images/icon.png (1024 × 1024, opaque)');

  /** In-app + splash (`AppLogo`, expo-splash-screen) — same art as store icon. */
  await pngFromSvg(full, 1024, join(assetsImages, 'logo.png'), {
    flattenHex: BG,
  });
  console.log('Wrote assets/images/logo.png (splash / header)');

  await pngFromSvg(full, 48, join(assetsImages, 'favicon.png'), {
    flattenHex: BG,
  });
  console.log('Wrote assets/images/favicon.png (web)');

  await fs.mkdir(iosOut, { recursive: true });

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
  console.log('Wrote assets/images/app-icon-foreground.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
