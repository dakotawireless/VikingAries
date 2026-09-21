import fs from 'node:fs';
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



test('Smoke Signals migration registration exposes isolated repo, Convex and Cloudflare targets', () => {
  const project = MIGRATED_PROJECTS['smoke-pos'];
  const result = migrateProjectMappings('smoke-pos');
  assert.equal(project.repository, 'dakotawireless/Smoke-Signals-POS---New');
  assert.equal(project.defaultBranch, 'migration/remove-hercules');
  assert.equal(project.backendDeployment, 'benevolent-bulldog-176');
  assert.equal(project.backendUrl, 'https://benevolent-bulldog-176.convex.cloud');
  assert.equal(project.cloudflareWorker, 'smoke-signals-pos---new');
  assert.equal(result.github.repository, project.repository);
  assert.equal(result.github.branch, project.defaultBranch);
  assert.equal(result.convex.deployment, project.backendDeployment);
  assert.equal(result.cloudflare.worker, project.cloudflareWorker);
});

test('Smoke Signals has exactly one authoritative project registration', () => {
  const source = fs.readFileSync(new URL('../shared/projects.js', import.meta.url), 'utf8');
  const matches = source.match(/"smoke-pos"\s*:\s*\{/g) || [];
  assert.equal(matches.length, 1);
  assert.equal(MIGRATED_PROJECTS['smoke-pos'].convexDashboardUrl, 'https://dashboard.convex.dev/t/erik-2df00/smoke-signals-pos-new/benevolent-bulldog-176');
});

test('Viking Aries registration repairs stale blank project mappings', () => {
  const project = MIGRATED_PROJECTS['viking-aries'];
  const result = migrateProjectMappings('viking-aries', {
    github: { enabled: true, repository: 'dakotawireless/VikingAries', branch: 'main' },
    cloudflare: { enabled: true, worker: 'vikingaries', deploymentUrl: 'https://vikingaries.dakotawireless.net/' },
    convex: { enabled: true, deployment: '', url: '', dashboardUrl: '' },
  });
  assert.equal(project.backendDeployment, 'flippant-mandrill-487');
  assert.equal(project.backendUrl, 'https://flippant-mandrill-487.convex.cloud');
  assert.equal(result.convex.deployment, 'flippant-mandrill-487');
  assert.equal(result.convex.url, 'https://flippant-mandrill-487.convex.cloud');
  assert.equal(result.cloudflare.worker, 'vikingaries');
  assert.equal(result.github.repository, 'dakotawireless/VikingAries');
});
