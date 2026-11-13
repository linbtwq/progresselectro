const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const destination = path.join(__dirname, 'web');
for (const asset of ['index.html', 'style.css', 'manifest.json', 'version.js', 'images.jpg', 'css', 'javascript']) {
    fs.cpSync(path.join(root, asset), path.join(destination, asset), {recursive: true});
}
