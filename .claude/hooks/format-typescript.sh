#!/usr/bin/env bash
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# Read JSON input from stdin
input=$(cat)

# Extract file path
file_path=$(echo "$input" | jq -r '.tool_input.file_path')

# Only process TypeScript/JavaScript files
if [[ ! "$file_path" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

# Skip if file doesn't exist
if [ ! -f "$file_path" ]; then
  exit 0
fi

# Run prettier
npx prettier --write "$file_path" 2>/dev/null
if [ $? -eq 0 ]; then
  echo "✓ Formatted: $file_path"
fi
