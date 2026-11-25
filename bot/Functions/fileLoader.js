// Adapted from XelosV14 Functions/fileLoader.js.
const fs = require('node:fs');
const path = require('node:path');

function walkDir(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkDir(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files.sort();
}

async function loadFiles(dirName) {
  const files = walkDir(path.resolve(__dirname, '..', dirName));
  for (const file of files) delete require.cache[file];
  return files;
}

module.exports = { loadFiles };
