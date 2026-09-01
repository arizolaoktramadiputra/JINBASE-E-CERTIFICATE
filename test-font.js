const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Test: embed GreatVibes font as base64 in SVG and render with sharp
const fontData = fs.readFileSync(path.join(__dirname, 'fonts', 'GreatVibes-Regular.ttf'));
const fontB64 = fontData.toString('base64');

const svg = `<svg width="600" height="200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face {
        font-family: 'GreatVibes';
        src: url('data:font/truetype;base64,${fontB64}') format('truetype');
      }
    </style>
  </defs>
  <rect width="600" height="200" fill="#FDF8F2"/>
  <rect x="14" y="14" width="572" height="172" fill="none" stroke="#8B0000" stroke-width="2"/>
  <text x="300" y="130" text-anchor="middle" font-family="GreatVibes" font-size="72" fill="#8B0000">Test Name</text>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toBuffer()
  .then(b => {
    fs.writeFileSync('test-font.png', b);
    console.log('Font embed test ok, size:', b.length);
  })
  .catch(e => console.error('Error:', e.message));
