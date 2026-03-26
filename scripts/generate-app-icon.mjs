/**
 * Rasterizes the vector app icon for Expo + optional iOS size exports.
 * Usage: npm run generate:app-icon
 */
import fs from 'node:fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const assets = join(root, 'assets', 'images');
const iosOut = join(root, 'assets', 'icons', 'ios');

const PATHS = `
  <path fill="#4CAF50" d="M 334 336 L 352 286 L 372 336 L 392 286 L 412 336 L 432 286 L 452 336 L 472 286 L 490 336 L 490 688 L 472 738 L 452 688 L 432 738 L 412 688 L 392 738 L 372 688 L 352 738 L 334 688 Z"/>
  <path fill="#FF7A00" d="M 534 336 L 552 286 L 572 336 L 592 286 L 612 336 L 632 286 L 652 336 L 672 286 L 690 336 L 690 688 L 672 738 L 652 688 L 632 738 L 612 688 L 592 738 L 572 688 L 552 738 L 534 688 Z"/>
`;

function svgFull() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#F5F5F5"/>
  ${PATHS}
</svg>`;
}

/** Android adaptive foreground: transparent, symbol scaled for ~66% safe circle. */
function svgForeground() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <g transform="translate(512 512) scale(0.82) translate(-512 -512)">
    ${PATHS}
  </g>
</svg>`;
}

async function pngFromSvg(svgString, size, file) {
  await sharp(Buffer.from(svgString))
    .resize(size, size)
    .png()
    .toFile(file);
}

async function main() {
  const full = svgFull();
  const fg = svgForeground();

  await pngFromSvg(full, 1024, join(assets, 'icon.png'));
  console.log('Wrote assets/images/icon.png (1024)');

  await fs.mkdir(iosOut, { recursive: true });

  /** Standard iPhone / iPad / marketing exports from same master art. */
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
    await pngFromSvg(full, px, join(iosOut, name));
  }
  console.log(`Wrote ${iosSizes.length} files to assets/icons/ios/`);

  await pngFromSvg(fg, 1024, join(assets, 'app-icon-foreground.png'));
  console.log('Wrote assets/images/app-icon-foreground.png (adaptive / Play)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
