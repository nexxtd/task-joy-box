const fs = require('fs');
const path = require('path');

const distServerDir = path.join(process.cwd(), 'dist-server');
const packageJsonPath = path.join(distServerDir, 'package.json');

fs.mkdirSync(distServerDir, { recursive: true });
fs.writeFileSync(
  packageJsonPath,
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf8'
);
