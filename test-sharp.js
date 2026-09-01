const sharp = require('sharp');
const fs = require('fs');

const svg = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="200" fill="#FDF8F2"/>
  <text x="200" y="120" text-anchor="middle" font-size="40" fill="#8B0000">Test OK</text>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toBuffer()
  .then(b => {
    fs.writeFileSync('test-sharp.png', b);
    console.log('sharp SVG->PNG ok, size:', b.length);
  })
  .catch(e => console.error('Error:', e.message));
