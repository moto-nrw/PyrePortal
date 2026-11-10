import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const config = JSON.parse(readFileSync(new URL('../devbox.json', import.meta.url), 'utf8'));
const hook = config.shell.init_hook.find(command => command.includes('agent-browser'));

for (const scenario of ['available', 'install succeeds', 'package fails', 'browser fails']) {
  test(`optional agent-browser setup: ${scenario}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'pyreportal-devbox-'));
    const calls = join(directory, 'calls');
    const executable = (name, body) =>
      writeFileSync(join(directory, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    try {
      executable('which', 'command -v "$@"');
      executable(
        'pnpm',
        `echo "$*" >> "$CALLS"
[ "$*" = 'add -g agent-browser' ] || exit 99
[ "$SCENARIO" != 'package fails' ] || exit 73
/bin/cp "$BROWSER_STUB" "$STUB_DIR/agent-browser"`
      );
      executable(
        'browser-stub',
        `echo "browser $*" >> "$CALLS"
[ "$*" = install ] || exit 99
[ "$SCENARIO" != 'browser fails' ] || exit 74`
      );
      if (scenario === 'available') {
        executable('agent-browser', 'exit 99');
      }
      const result = spawnSync('/bin/bash', ['-ec', `${hook}\necho CHECK_STARTED`], {
        encoding: 'utf8',
        env: {
          PATH: directory,
          CALLS: calls,
          SCENARIO: scenario,
          STUB_DIR: directory,
          BROWSER_STUB: join(directory, 'browser-stub'),
        },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /CHECK_STARTED/);
      if (scenario.endsWith('fails')) {
        assert.match(result.stderr, /Warning:.*agent-browser/);
      }
      if (scenario === 'available') {
        assert.equal(existsSync(calls), false, 'an available command must skip setup');
      } else {
        assert.equal(
          readFileSync(calls, 'utf8'),
          scenario === 'package fails'
            ? 'add -g agent-browser\n'
            : 'add -g agent-browser\nbrowser install\n'
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
