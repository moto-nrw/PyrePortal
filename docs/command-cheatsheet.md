# PyrePortal Command Cheatsheet

A comprehensive reference guide for commands used in the PyrePortal project, which uses Tauri v2, React, TypeScript, Vite, and Tailwind CSS.

## Table of Contents

- [Setup & Installation](#setup--installation)
- [Development Workflow](#development-workflow)
- [Building & Deployment](#building--deployment)
- [Testing](#testing)
- [Maintenance & Updates](#maintenance--updates)
- [Technology-Specific Commands](#technology-specific-commands)
  - [Tauri v2](#tauri-v2)
  - [React](#react)
  - [TypeScript](#typescript)
  - [Vite](#vite)
  - [Tailwind CSS](#tailwind-css)
  - [npm](#npm)
  - [Cargo](#cargo)
- [Development Workflow Tips](#development-workflow-tips)

## Setup & Installation

### Project Setup

```bash
# Clone repository
git clone <repository-url> PyrePortal
cd PyrePortal

# Install npm dependencies
npm install

# Install Tauri CLI (if not already installed)
cargo install tauri-cli --version "^2.0.0"
```

### Development Environment Setup

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js and npm (recommended to use nvm)
# nvm install node

# Install platform-specific Tauri dependencies
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# macOS
xcode-select --install
brew install cmake

# Windows (using Chocolatey)
choco install nodejs-lts rust-ms visualstudio2022-workload-vctools
```

## Development Workflow

### Starting Development

```bash
# Start frontend dev server only
npm run dev

# Start Tauri development (backend + frontend)
npm run tauri dev

# Run with specific features
cargo tauri dev --features="feature1,feature2"

# Run with verbose output
cargo tauri dev -- --verbose
```

### Common Development Tasks

```bash
# TypeScript type checking
npm run typecheck
# or
npx tsc --noEmit

# Formatting code
npm run format             # Format all files with Prettier
npm run format:check      # Check formatting without making changes
# or
npx prettier --write "**/*.{ts,tsx,js,jsx,json,css,md}"
npx prettier --check "**/*.{ts,tsx,js,jsx,json,css,md}"

# Linting
npm run lint              # Run ESLint without fixing
npm run lint:fix          # Run ESLint with automatic fixes
# or
npx eslint src --ext .ts,.tsx
npx eslint src --ext .ts,.tsx --fix

# Complete code quality check
npm run check             # Run both ESLint and TypeScript checks

# Clean Rust target directory
npm run clean:target      # Removes build artifacts from src-tauri/target
```

## Building & Deployment

### Building the Application

```bash
# Build the entire application (production)
npm run tauri build

# Build with specific config
cargo tauri build --config tauri.conf.debug.json

# Build for specific target
cargo tauri build --target x86_64-pc-windows-msvc

# Build with debug features
cargo tauri build --debug
```

### Creating Installers

```bash
# Build with all default bundles
cargo tauri build

# Build with specific bundle types
cargo tauri build --bundles deb,appimage,nsis

# Build with updater
cargo tauri build --features updater
```

## Testing

```bash
# Run all frontend tests
npm run test

# Run Rust tests
cargo test

# Run Rust tests with specific features
cargo test --features="feature1,feature2"

# Run specific test
npm run test -- -t "test name pattern"
```

## Maintenance & Updates

### Dependency Management

```bash
# Update npm dependencies
npm update

# Check outdated npm packages
npm outdated

# Update Rust dependencies
cargo update

# Check outdated Rust packages
cargo outdated

# Audit dependencies for security issues
npm audit
cargo audit
```

### Version Management

```bash
# Update application version in package.json
npm version patch|minor|major

# Update Tauri version in Cargo.toml and tauri.conf.json
cargo update -p tauri
```

## Technology-Specific Commands

### Tauri v2

```bash
# Initialize a new Tauri v2 project
cargo create-tauri-app

# Add a Tauri plugin
cargo add tauri-plugin-<plugin-name>

# List all available plugins
cargo tauri plugin list

# Check Tauri configuration
cargo tauri info

# Generate API types for Tauri commands
cargo tauri plugin turbopack build type-definitions

# Launch Tauri DevTools
cargo tauri dev -- --devtools

# Generate icons from a source image
cargo tauri icon path/to/icon.png

# Build with custom environment variables
cargo tauri build -- --env.VAR_NAME=value
```

### React

```bash
# Create a new component
npx generate-react-cli component ComponentName

# Install React DevTools
npm install -g react-devtools

# Analyze React component structure
npx react-scanner src/
```

### TypeScript

```bash
# Type checking
npm run typecheck
# or
npx tsc --noEmit

# Generate TypeScript declarations
npx tsc --declaration --emitDeclarationOnly

# Show TypeScript version
npx tsc --version

# Check for unused exports
npx ts-prune

# Run both linting and type checking
npm run check
```

### Vite

```bash
# Start development server
npm run dev
# or
npx vite

# Preview production build
npm run preview
# or
npx vite preview

# Build for production
npx vite build

# Clean Vite cache
npx vite --force
```

### Tailwind CSS

```bash
# Initialize Tailwind config
npx tailwindcss init

# Build CSS with Tailwind
npx tailwindcss -i src/input.css -o dist/output.css

# Watch for changes
npx tailwindcss -i src/input.css -o dist/output.css --watch

# Analyze Tailwind CSS usage
npx tailwind-analyzer
```

### npm

```bash
# Install dependencies
npm install

# Install a development dependency
npm install --save-dev package-name

# Run script from package.json
npm run script-name

# List all scripts
npm run

# Initialize a new package.json
npm init

# Publish package
npm publish
```

### Cargo

```bash
# Create a new Rust package
cargo new package-name

# Build Rust code
cargo build

# Run Rust code
cargo run

# Check for errors without building
cargo check

# Run tests
cargo test

# Generate documentation
cargo doc --open

# Install a binary
cargo install binary-name

# Format Rust code
cargo fmt

# Run Clippy linter to check for common mistakes
cargo clippy

# Run Clippy with warnings treated as errors (like CI)
cargo clippy -- -D warnings

# Auto-fix Clippy warnings (less aggressive)
cargo clippy --fix

# Auto-fix Clippy warnings (more aggressive)
cargo clippy --fix-aggressive

# Auto-fix Clippy warnings (preserves semantics)
cargo clippy --fix-safe
```

## Development Workflow Tips

### Efficient Development Patterns

1. **Hot Module Replacement (HMR)**
   - Vite provides HMR out of the box, making React component updates instant.
   - Use the React Fast Refresh feature for maintaining component state.

2. **Parallel Development**
   - Run Vite frontend and Tauri backend development servers separately when working primarily on UI.
   - Use `npm run dev` for frontend-only changes to avoid Rust compilation times.
   - Use `npm run tauri dev` when working on full-stack features.

3. **TypeScript Optimization**
   - Use the TypeScript Language Server in your IDE for realtime feedback.
   - Run periodic type checks with `npm run typecheck` during development.

4. **Debug Tools**
   - Access Tauri logs:
     - Windows: `%APPDATA%\<app-name>\logs`
     - macOS: `~/Library/Logs/<app-name>`
     - Linux: `~/.config/<app-name>/logs`
   - Use `console.log` for frontend logging, `println!` for Rust logging.
   - Enable DevTools with `--devtools` flag.

5. **Performance Profiling**
   - Use Chrome DevTools Performance tab for frontend profiling.
   - Use `cargo flamegraph` for Rust performance profiling.

### Command Aliases

Add these to your shell configuration for faster workflow:

```bash
# .bashrc or .zshrc
alias td="npm run tauri dev"
alias tb="npm run tauri build"
alias vd="npm run dev"
alias vb="npm run build"
alias tc="npm run typecheck"
alias lint="npm run lint"
alias lintfix="npm run lint:fix"
alias fmt="npm run format"
alias check="npm run check"
alias clean="npm run clean:target"
```

### VSCode Setup

Recommended `settings.json` configuration:

```json
{
  "rust-analyzer.check.command": "clippy",
  "rust-analyzer.check.extraArgs": ["--", "-W", "clippy::all"],
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact"],
  "prettier.configPath": "prettier.config.js"
}
```

### Environment-Specific Configurations

Create environment-specific Tauri configs:

- `tauri.conf.dev.json` - Development settings
- `tauri.conf.prod.json` - Production settings

Run with specific config:

```bash
cargo tauri build --config tauri.conf.prod.json
```

### Common Issues & Solutions

1. **WebView2 Missing on Windows**
   - Solution: Add WebView2 installer to your bundle
   - Config in `tauri.conf.json`:
     ```json
     {
       "bundle": {
         "windows": {
           "webviewInstallMode": {
             "type": "downloadBootstrapper"
           }
         }
       }
     }
     ```

2. **Large Bundle Size**
   - Analyze with `npx vite-bundle-visualizer`
   - Use dynamic imports for code splitting
   - Optimize Tailwind with purge/content settings

3. **Development Performance**
   - Use `cargo check` instead of `cargo build` for quick syntax validation
   - Enable incremental compilation in `Cargo.toml`
