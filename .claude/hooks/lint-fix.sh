#!/bin/bash

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

# Run ESLint with auto-fix
npx eslint --fix "$file_path" 2>/dev/null
if [ $? -eq 0 ]; then
  echo "✓ Linted: $file_path"
else
  # Show warnings but don't fail
  echo "⚠ ESLint warnings for: $file_path"
fi
