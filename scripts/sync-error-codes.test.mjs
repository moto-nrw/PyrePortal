import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  defaultRegistryPath,
  generate,
  readRegistry,
  renderRegistry,
} from './sync-error-codes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const care = { code: 'care.child_required', class: 'input', legacy: 'CHILD_REQUIRED' };
const identity = { code: 'identity.access_denied', class: 'permission', legacy: 'ACCESS_DENIED' };

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'pyreportal-error-sync-'));
  return Promise.resolve()
    .then(() => run(directory))
    .finally(() => rmSync(directory, { recursive: true, force: true }));
}

function writeRegistry(path, codes) {
  writeFileSync(path, JSON.stringify({ codes }));
}

test('all domain fragments produce byte-identical output to the equivalent legacy registry', () =>
  fixture(async directory => {
    const fragments = join(directory, 'error-registry');
    mkdirSync(fragments);
    writeRegistry(join(fragments, 'identity.json'), [identity]);
    writeRegistry(join(fragments, 'care.json'), [care]);
    const legacyPath = join(directory, 'error-registry.json');
    writeRegistry(legacyPath, [identity, care]);
    const fragmented = await renderRegistry(readRegistry(fragments));
    const aggregate = await renderRegistry(readRegistry(legacyPath));
    assert.equal(fragmented, aggregate);
    assert.match(fragmented, /'care.child_required': 'input'/);
    assert.match(fragmented, /CHILD_REQUIRED: 'care.child_required'/);
    assert.match(fragmented, /ACCESS_DENIED: 'identity.access_denied'/);
  }));

test('new domain files are discovered without changing a domain list', () =>
  fixture(directory => {
    writeRegistry(join(directory, 'care.json'), [care]);
    writeRegistry(join(directory, 'future.json'), [
      { code: 'future.new_error', class: 'server', legacy: 'FUTURE_ERROR' },
    ]);
    const output = generate(readRegistry(directory));
    assert.match(output, /future.new_error/);
  }));

test('legacy aliases are globally unique across different domain fragments', () =>
  fixture(directory => {
    writeRegistry(join(directory, 'care.json'), [care]);
    writeRegistry(join(directory, 'identity.json'), [{ ...identity, legacy: care.legacy }]);
    assert.throws(() => generate(readRegistry(directory)), /duplicate legacy code/);
  }));

test('a legacy alias cannot shadow a canonical code from another domain', () =>
  fixture(directory => {
    writeRegistry(join(directory, 'care.json'), [{ ...care, legacy: identity.code }]);
    writeRegistry(join(directory, 'identity.json'), [identity]);
    assert.throws(() => generate(readRegistry(directory)), /also a current code/);
  }));

test('invalid codes, duplicate codes and invalid classes still fail', () => {
  assert.throws(() => generate({ codes: [{ ...care, code: 'INVALID' }] }), /invalid error code/);
  assert.throws(() => generate({ codes: [care, care] }), /duplicate error code/);
  assert.throws(() => generate({ codes: [{ ...care, class: 'unknown' }] }), /invalid class/);
});

test('an explicit missing, malformed, empty or wrong-domain source never falls back', () =>
  fixture(directory => {
    assert.throws(() => readRegistry(join(directory, 'missing.json')), { code: 'ENOENT' });
    assert.throws(() => readRegistry(directory), /no error registry fragments/);
    writeFileSync(join(directory, 'care.json'), 'not json');
    assert.throws(() => readRegistry(directory));
    writeRegistry(join(directory, 'care.json'), []);
    assert.throws(() => readRegistry(directory), /nonempty array/);
    writeRegistry(join(directory, 'care.json'), [identity]);
    assert.throws(() => readRegistry(directory), /wrong domain/);
  }));

test('defaults prefer canonical fragments, with legacy fallback only while the directory is absent', () =>
  fixture(directory => {
    const checkout = join(directory, 'PyrePortal');
    const producer = join(directory, 'project-phoenix');
    mkdirSync(checkout);
    mkdirSync(producer);
    const legacy = join(producer, 'error-registry.json');
    writeRegistry(legacy, [care]);
    assert.equal(defaultRegistryPath(checkout), legacy);
    const canonical = join(producer, 'error-registry');
    mkdirSync(canonical);
    assert.equal(defaultRegistryPath(checkout), canonical);
    assert.throws(() => readRegistry(defaultRegistryPath(checkout)), /no error registry fragments/);
  }));

test('a present but broken canonical source never falls back to the legacy sibling', () =>
  fixture(directory => {
    const checkout = join(directory, 'PyrePortal');
    const producer = join(directory, 'project-phoenix');
    mkdirSync(checkout);
    mkdirSync(producer);
    writeRegistry(join(producer, 'error-registry.json'), [care]);
    const canonical = join(producer, 'error-registry');
    symlinkSync('missing-canonical-source', canonical);
    assert.equal(defaultRegistryPath(checkout), canonical);
    assert.throws(() => readRegistry(defaultRegistryPath(checkout)), { code: 'ENOENT' });
  }));

test('a producer discovery error is not hidden by worktree fallback', () =>
  fixture(directory => {
    const checkout = join(directory, 'PyrePortal');
    mkdirSync(checkout);
    writeFileSync(join(directory, 'project-phoenix'), 'not a directory');
    assert.throws(() => defaultRegistryPath(checkout), { code: 'ENOTDIR' });
  }));

test('--check reports stale output without modifying the checked-in kiosk mapping', () =>
  fixture(directory => {
    const registry = join(directory, 'registry.json');
    writeRegistry(registry, [care]);
    const output = join(root, 'src/services/errorCodes.generated.ts');
    const before = readFileSync(output, 'utf8');
    const result = spawnSync(
      process.execPath,
      [join(root, 'scripts/sync-error-codes.mjs'), '--check', registry],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /out of date/);
    assert.equal(readFileSync(output, 'utf8'), before);
  }));
