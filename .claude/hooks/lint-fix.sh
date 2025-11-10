#!/usr/bin/env bash
set -euo pipefail

# Read JSON input from stdin
input=$(</dev/stdin)

# Extract file path
file_path=$(jq -r '.tool_input.file_path' <<< "${input}")

# Only process TypeScript/JavaScript files
if [[ ! "${file_path}" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

# Skip if file doesn't exist
if [[ ! -f "${file_path}" ]]; then
  exit 0
fi

# Run ESLint with auto-fix and failure tolerance
if npx eslint --fix "${file_path}" 2>&1 >/dev/null; then
  echo "✓ Linted: ${file_path}" >&2
else
  echo "⚠ ESLint warnings for: ${file_path}" >&2
fi

exit 0
