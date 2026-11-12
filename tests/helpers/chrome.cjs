const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.env.CHROME_PATH && !fs.existsSync(process.env.CHROME_PATH))
  throw new Error('CHROME_PATH does not point to an existing browser');

module.exports = process.env.CHROME_PATH || (process.platform === 'win32'
  ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
    .filter(Boolean).map(root => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    .find(file => fs.existsSync(file))
  : ['google-chrome', 'chromium', 'chromium-browser'].find(command =>
    spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0));
