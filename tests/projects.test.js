import test from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATED_PROJECTS, migrateProjectMappings } from '../shared/projects.js';

test('existing project integrations migrate without losing unrelated settings', () => {
  const result = migrateProjectMappings('dw-pos', { github: { branch: 'main' }, convex: { deployment: 'sleek-bear-647' }, drive: { folderUrl: 'keep' } });
  assert.equal(result.github.branch, 'migration-staging');
  assert.equal(result.convex.deployment, 'energized-crane-577');
  assert.equal(result.cloudflare.deploymentUrl, MIGRATED_PROJECTS['dw-pos'].deploymentUrl);
  assert.equal(result.drive.folderUrl, 'keep');
});
test('website registration includes full repository, preview and backend', () => {
  const result = migrateProjectMappings('dw-site');
  assert.equal(result.github.repository, 'dakotawireless/DW-Website---NEW');
  assert.equal(result.github.branch, 'migration-staging');
  assert.equal(result.convex.deployment, 'little-bat-645');
  assert.ok(result.cloudflare.deploymentUrl.startsWith('https://'));
});
test('later user edits and unrelated projects are retained', () => {
  const edited = { ...migrateProjectMappings('dw-pos'), github: { branch: 'custom' } };
  assert.equal(migrateProjectMappings('dw-pos', edited), edited);
  assert.equal(migrateProjectMappings('custom', edited), edited);
});


test('Smoke Signals registration maps the migration repo and Convex backend without inventing Cloudflare', () => {
  const result = migrateProjectMappings('smoke-pos');
  assert.equal(result.github.repository, 'dakotawireless/Smoke-Signals-POS---New');
  assert.equal(result.github.branch, 'migration/remove-hercules');
  assert.equal(result.convex.deployment, 'benevolent-bulldog-176');
  assert.equal(result.convex.url, 'https://benevolent-bulldog-176.convex.cloud');
  assert.equal(result.cloudflare.enabled, false);
  assert.equal(result.cloudflare.worker, '');
});
