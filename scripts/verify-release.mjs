#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const tag = process.argv[2] ?? '';
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const expectedTag = `v${packageJson.version}`;

if (tag !== expectedTag) {
  console.error(`Release tag ${JSON.stringify(tag)} does not match package version ${JSON.stringify(packageJson.version)}; expected ${expectedTag}.`);
  process.exit(1);
}

const escapedVersion = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const releaseHeading = new RegExp(`^## \\[${escapedVersion}\\](?: - \\d{4}-\\d{2}-\\d{2})?$`, 'm');
if (!releaseHeading.test(changelog)) {
  console.error(`CHANGELOG.md has no release heading for ${packageJson.version}.`);
  process.exit(1);
}

console.log(`Validated ${packageJson.name}@${packageJson.version} for ${tag}.`);
