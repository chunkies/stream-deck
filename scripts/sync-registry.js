'use strict';

// Updates downloadUrl and repo fields in registry/registry.json for all verified
// (first-party) plugins based on the current version field.
// Run this after bumping a plugin version in registry.json to regenerate URLs.
//
// Third-party plugins (verified: false or absent) are left untouched.

const fs   = require('fs');
const path = require('path');

const REGISTRY_PATH = path.resolve(__dirname, '../registry/registry.json');
const GITHUB_ORG    = 'https://github.com/chunkies';

function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  let changed = 0;

  for (const plugin of registry.plugins) {
    if (!plugin.verified) continue;

    const { id, version } = plugin;
    const repoUrl     = `${GITHUB_ORG}/macropad-plugin-${id}`;
    const downloadUrl = `${repoUrl}/archive/refs/tags/v${version}.zip`;

    if (plugin.repo !== repoUrl || plugin.downloadUrl !== downloadUrl || plugin.homepage !== repoUrl) {
      plugin.repo        = repoUrl;
      plugin.homepage    = repoUrl;
      plugin.authorUrl   = GITHUB_ORG;
      plugin.downloadUrl = downloadUrl;
      changed++;
      console.log(`  updated  ${id}@${version}  →  ${downloadUrl}`);
    }
  }

  registry.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');

  if (changed === 0) {
    console.log('All URLs already up to date.');
  } else {
    console.log(`\nUpdated ${changed} plugin(s) in registry/registry.json`);
  }
}

main();
