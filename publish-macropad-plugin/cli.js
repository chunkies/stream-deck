#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function die(msg) {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}

function openUrl(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') cmd = 'open';
  else if (platform === 'win32') cmd = 'start';
  else cmd = 'xdg-open';

  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}

// ─── Step 1: Read & validate manifest ───────────────────────────────────────

const cwd = process.cwd();
const manifestPath = path.join(cwd, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  die(
    `No manifest.json found in ${cwd}\n` +
    `  Run this command from the root of your plugin directory.`
  );
}

const manifest = readJSON(manifestPath);
if (!manifest) {
  die(`Failed to parse manifest.json — ensure it is valid JSON.`);
}

const REQUIRED_FIELDS = [
  'id', 'name', 'version', 'description', 'author',
  'icon', 'license', 'minAppVersion', 'actions',
];

const missing = REQUIRED_FIELDS.filter(f => manifest[f] === undefined || manifest[f] === null || manifest[f] === '');
if (missing.length > 0) {
  die(
    `manifest.json is missing required field(s): ${missing.join(', ')}\n` +
    `  All required fields: ${REQUIRED_FIELDS.join(', ')}`
  );
}

if (!/^[a-z0-9-]+$/.test(manifest.id)) {
  die(
    `Invalid plugin id: "${manifest.id}"\n` +
    `  id must match ^[a-z0-9-]+$ (lowercase letters, digits, and hyphens only)`
  );
}

if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  die(
    `Invalid version: "${manifest.version}"\n` +
    `  version must match semver format: MAJOR.MINOR.PATCH (e.g. 1.0.0)`
  );
}

// Optional: read package.json for fallback/main
const pkgJson = readJSON(path.join(cwd, 'package.json'));
const main = (pkgJson && pkgJson.main) ? pkgJson.main : undefined;

// ─── Step 2: Derive registry entry ──────────────────────────────────────────

const repo = `https://github.com/you/macropad-plugin-${manifest.id}`;
const homepage = repo;
const downloadUrl = `${repo}/archive/refs/tags/v${manifest.version}.zip`;

const entry = {
  id: manifest.id,
  name: manifest.name,
  version: manifest.version,
  description: manifest.description,
  author: manifest.author,
  icon: manifest.icon,
  license: manifest.license,
  minAppVersion: manifest.minAppVersion,
  repo,
  homepage,
  downloadUrl,
  tags: Array.isArray(manifest.tags) ? manifest.tags : [],
  price: 0,
  downloads: 0,
  verified: false,
};

// ─── Step 3: Print result ────────────────────────────────────────────────────

const PR_URL = 'https://github.com/chunkies/macropad/edit/master/registry/registry.json';

console.log(`\n✅  Plugin validated: ${manifest.id} v${manifest.version}\n`);
console.log(`📋  Copy this into registry/registry.json → plugins array:\n`);
console.log(JSON.stringify(entry, null, 2));
console.log(`
⚠   Before submitting, update:
  - "repo" and "homepage" to your real GitHub URL
  - "downloadUrl" to the actual release tag zip URL

📎  Open a PR at:
  ${PR_URL}
`);

// ─── Step 4: Offer to open PR URL (TTY only) ─────────────────────────────────

if (process.stdout.isTTY) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Press Enter to open the PR page in your browser, or Ctrl+C to skip...\n', () => {
    rl.close();
    openUrl(PR_URL);
  });
} else {
  process.exit(0);
}
