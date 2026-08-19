import { describe, expect, it } from 'vitest';

import { ERROR_MESSAGE_MAPPINGS } from './apiErrors';

// ====================================================================
// Backend contract guard (project-phoenix)
//
// The patterns match backend error strings and the German messages are
// shown to users. Both sides are a contract: changing backend error text
// breaks the mapping silently, changing German text changes the UI.
// If this snapshot fails, verify the change against project-phoenix
// before updating it.
// ====================================================================

describe('ERROR_MESSAGE_MAPPINGS backend contract', () => {
  it('keeps all patterns and German messages byte-identical', () => {
    expect(ERROR_MESSAGE_MAPPINGS).toMatchSnapshot();
  });

  it('keeps the number of mappings stable', () => {
    expect(ERROR_MESSAGE_MAPPINGS).toHaveLength(52);
  });
});
