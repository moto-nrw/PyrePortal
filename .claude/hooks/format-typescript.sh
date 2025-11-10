#!/usr/bin/env bash
set -euo pipefail

# Read JSON input from stdin
input=$(</dev/stdin)

# Extract file path
file_path=$(jq -r '.tool_input.file_path' <<< "${input}")

# Only process files that Prettier supports
if [[ ! "${file_path}" =~ \.(ts|tsx|js|jsx|json|css|md)$ ]]; then
  exit 0
fi

# Skip if file doesn't exist
if [[ ! -f "${file_path}" ]]; then
  exit 0
fi

# Run prettier with failure tolerance
if npx prettier --write "${file_path}" 2>&1 >/dev/null; then
  echo "✓ Formatted: ${file_path}" >&2
else
  echo "⚠ Prettier failed for: ${file_path}" >&2
fi

exit 0
