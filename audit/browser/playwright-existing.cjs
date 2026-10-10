const { resolve } = require('node:path');
const playwright = require(resolve(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'));
const launch = playwright.chromium.launch.bind(playwright.chromium);
playwright.chromium.launch = (options = {}) => launch({
  executablePath: process.env.QA_CHROMIUM_EXECUTABLE,
  ...options
});
module.exports = playwright;
