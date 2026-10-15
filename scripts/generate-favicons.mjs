import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Build the SVG icon for theroadproblem.quest
// Theme: Deep civic matcha (#02492a), perspective roadway with amber markings (#fbbf24),
// and a glowing civic observatory radio beacon (#34d399, #10b981) emitting signal waves.
function buildSvg() {
  // Trigonometry helper for radar signal arcs
  const cx = 256;
  const cy = 200;
  
  function arcPath(radius, sweepAngleDeg) {
    const halfSweep = (sweepAngleDeg / 2) * (Math.PI / 180);
    // Upward arc centered at -PI/2 (top: 270 deg)
    const startAngle = -Math.PI / 2 - halfSweep;
    const endAngle = -Math.PI / 2 + halfSweep;
    const x1 = (cx + radius * Math.cos(startAngle)).toFixed(2);
    const y1 = (cy + radius * Math.sin(startAngle)).toFixed(2);
    const x2 = (cx + radius * Math.cos(endAngle)).toFixed(2);
    const y2 = (cy + radius * Math.sin(endAngle)).toFixed(2);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  }

  const arc1 = arcPath(60, 130);
  const arc2 = arcPath(104, 126);
  const arc3 = arcPath(150, 120);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <!-- Background Gradient: Deep Matcha to Dark Forest -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#034e2c" />
      <stop offset="45%" stop-color="#023b22" />
      <stop offset="100%" stop-color="#012213" />
    </linearGradient>

    <!-- Inner Border Gradient -->
    <linearGradient id="strokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.4" />
      <stop offset="50%" stop-color="#10b981" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#059669" stop-opacity="0.05" />
    </linearGradient>

    <!-- Road Surface Gradient -->
    <linearGradient id="roadGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1f2923" />
      <stop offset="100%" stop-color="#121815" />
    </linearGradient>

    <!-- Beacon Atmospheric Radial Halo -->
    <radialGradient id="beaconAura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.35" />
      <stop offset="60%" stop-color="#10b981" stop-opacity="0.12" />
      <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
    </radialGradient>

    <!-- Radar Glow Filter -->
    <filter id="beaconGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="7" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- Base Squircle Container (Clay aesthetic) -->
  <rect x="20" y="20" width="472" height="472" rx="108" fill="url(#bgGrad)" />
  <rect x="20" y="20" width="472" height="472" rx="108" fill="none" stroke="url(#strokeGrad)" stroke-width="6" />

  <!-- Atmospheric Glow behind Beacon and Arcs -->
  <circle cx="256" cy="200" r="110" fill="url(#beaconAura)" />

  <!-- Radio Radar Observability Arcs (Broadcast) -->
  <g fill="none" stroke-linecap="round">
    <!-- Outer Arc -->
    <path d="${arc3}" stroke="#059669" stroke-width="14" stroke-opacity="0.5" />
    <!-- Mid Arc -->
    <path d="${arc2}" stroke="#10b981" stroke-width="16" stroke-opacity="0.8" />
    <!-- Inner Arc -->
    <path d="${arc1}" stroke="#34d399" stroke-width="18" filter="url(#softGlow)" />
  </g>

  <!-- Roadway Surface (Perspective Highway) -->
  <path d="M 216 226 L 296 226 L 416 454 C 368 464, 144 464, 96 454 Z" fill="url(#roadGrad)" />

  <!-- Road Curb Edges -->
  <line x1="216" y1="226" x2="96" y2="454" stroke="#34d399" stroke-width="7" stroke-linecap="round" stroke-opacity="0.45" />
  <line x1="296" y1="226" x2="416" y2="454" stroke="#34d399" stroke-width="7" stroke-linecap="round" stroke-opacity="0.45" />

  <!-- Dashed Center Divider Markings (Vibrant Traffic Amber #fbbf24) -->
  <!-- Top dash (narrow, near horizon) -->
  <path d="M 251 242 L 261 242 L 262 278 L 250 278 Z" fill="#fbbf24" rx="2" />
  <!-- Mid dash (expanding perspective) -->
  <path d="M 249 298 L 263 298 L 265 348 L 247 348 Z" fill="#fbbf24" rx="4" />
  <!-- Bottom dash (wide, near viewer) -->
  <path d="M 246 372 L 266 372 L 270 442 L 242 442 Z" fill="#fbbf24" rx="6" />

  <!-- Observatory Beacon Transmitter / Node -->
  <!-- Lower stem anchor -->
  <path d="M 252 200 L 256 230 L 260 200 Z" fill="#34d399" />
  
  <!-- Glowing Beacon Core -->
  <g filter="url(#beaconGlow)">
    <!-- Emerald Aura -->
    <circle cx="256" cy="200" r="28" fill="#10b981" />
    <!-- Bright Mint Ring -->
    <circle cx="256" cy="200" r="18" fill="#34d399" />
    <!-- Pure White Center Signal -->
    <circle cx="256" cy="200" r="9" fill="#ffffff" />
  </g>
</svg>
`;
}

// Function to build a multi-image ICO buffer from an array of PNG buffers
function createIcoBuffer(pngBuffersWithSize) {
  // pngBuffersWithSize: array of { width, height, buffer }
  const count = pngBuffersWithSize.length;
  // Header: 6 bytes
  // Directory entries: 16 bytes each
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = headerSize + count * dirEntrySize;

  let currentOffset = dirSize;
  const entries = [];

  for (const item of pngBuffersWithSize) {
    const size = item.buffer.length;
    entries.push({
      width: item.width >= 256 ? 0 : item.width,
      height: item.height >= 256 ? 0 : item.height,
      colorCount: 0,
      reserved: 0,
      planes: 1,
      bpp: 32,
      bytes: size,
      offset: currentOffset,
      buffer: item.buffer,
    });
    currentOffset += size;
  }

  const icoBuffer = Buffer.alloc(currentOffset);

  // Write header
  icoBuffer.writeUInt16LE(0, 0); // reserved
  icoBuffer.writeUInt16LE(1, 2); // 1 = ICO
  icoBuffer.writeUInt16LE(count, 4); // count

  // Write directory entries
  let entryPos = headerSize;
  for (const entry of entries) {
    icoBuffer.writeUInt8(entry.width, entryPos + 0);
    icoBuffer.writeUInt8(entry.height, entryPos + 1);
    icoBuffer.writeUInt8(entry.colorCount, entryPos + 2);
    icoBuffer.writeUInt8(entry.reserved, entryPos + 3);
    icoBuffer.writeUInt16LE(entry.planes, entryPos + 4);
    icoBuffer.writeUInt16LE(entry.bpp, entryPos + 6);
    icoBuffer.writeUInt32LE(entry.bytes, entryPos + 8);
    icoBuffer.writeUInt32LE(entry.offset, entryPos + 12);
    entryPos += dirEntrySize;
  }

  // Write image buffers
  for (const entry of entries) {
    entry.buffer.copy(icoBuffer, entry.offset);
  }

  return icoBuffer;
}

async function main() {
  const publicDir = path.resolve('public');
  const appDir = path.resolve('src/app');

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const svgContent = buildSvg();
  const svgPath = path.join(publicDir, 'icon.svg');
  const appSvgPath = path.join(appDir, 'icon.svg');
  fs.writeFileSync(svgPath, svgContent, 'utf8');
  fs.writeFileSync(appSvgPath, svgContent, 'utf8');
  console.log('✓ Created public/icon.svg and src/app/icon.svg');

  const svgBuffer = Buffer.from(svgContent);

  // Generate PNG sizes
  const sizes = [16, 32, 48, 180, 192, 512];
  const pngBuffers = {};

  for (const size of sizes) {
    const png = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers[size] = png;
  }

  // Save standard icon files
  fs.writeFileSync(path.join(publicDir, 'favicon-16.png'), pngBuffers[16]);
  fs.writeFileSync(path.join(publicDir, 'favicon-32.png'), pngBuffers[32]);
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), pngBuffers[180]);
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), pngBuffers[192]);
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), pngBuffers[512]);
  console.log('✓ Created favicon-16.png, favicon-32.png, apple-touch-icon.png (180x180), icon-192.png, icon-512.png');

  // Build multi-res ICO (16, 32, 48)
  const icoData = createIcoBuffer([
    { width: 16, height: 16, buffer: pngBuffers[16] },
    { width: 32, height: 32, buffer: pngBuffers[32] },
    { width: 48, height: 48, buffer: pngBuffers[48] },
  ]);

  const icoPath = path.join(publicDir, 'favicon.ico');
  const appIcoPath = path.join(appDir, 'favicon.ico');
  fs.writeFileSync(icoPath, icoData);
  fs.writeFileSync(appIcoPath, icoData);
  console.log('✓ Created multi-resolution public/favicon.ico and src/app/favicon.ico');

  // Create manifest.json
  const manifest = {
    name: "theroadproblem.quest — India Road History & Observability",
    short_name: "RoadProblem",
    description: "Evidence-backed public road timeline tracking infrastructure damage, repairs, and public works contractors across India.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f7",
    theme_color: "#faf9f7",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "16x16 32x32 48x48",
        type: "image/x-icon"
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };

  fs.writeFileSync(
    path.join(publicDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
  console.log('✓ Created public/manifest.json');
}

main().catch(err => {
  console.error('Error generating favicons:', err);
  process.exit(1);
});
