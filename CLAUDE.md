# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PyrePortal is a desktop application built with Tauri v2, React, and TypeScript. The project uses Vite as the frontend build tool and combines Rust (Tauri) for the backend with React/TypeScript for the UI. It serves as a client for the Project Phoenix system, providing an interface for managing room occupancy and activities in educational settings.

### Key Features

- **User Authentication**: Secure login with PIN verification
- **Room Selection**: View and select available rooms with real-time status
- **Activity Management**: Create and track activities with category selection
- **Comprehensive Logging**: Detailed logging of user actions and system events
- **Cross-Platform**: Runs on Windows, macOS, and Linux

## Architecture

- **Frontend**: React + TypeScript application built with Vite
  - Located in the `/src` directory
  - Uses Tailwind CSS for styling
  - State management with Zustand
  - Routing with React Router
- **Backend**: Rust application using Tauri framework
  - Located in the `/src-tauri` directory
  - Exposes Rust functions to the frontend via Tauri commands
  - Handles system-level operations like file I/O for logging

The application follows the Tauri architecture where:

1. The UI is built with web technologies (React)
2. The backend logic is written in Rust
3. Communication between frontend and backend happens via Tauri's IPC mechanism

## Development Commands

### Essential Commands

```bash
# Install dependencies
npm install

# Run complete application in development mode (frontend + Tauri backend)
npm run tauri dev

# Run frontend only (faster for UI-focused development)
npm run dev

# Build for production
npm run tauri build

# Check code quality
npm run check        # Runs both ESLint and TypeScript checks

# Typecheck TypeScript files
npm run typecheck    # Only runs TypeScript checks

# Lint TypeScript files
npm run lint         # Check for linting issues
npm run lint:fix     # Automatically fix linting issues

# Format code
npm run format       # Format all files with Prettier
npm run format:check # Check formatting without making changes

# Clean Rust build artifacts
npm run clean:target # Removes build artifacts from src-tauri/target
```

### Rust-Specific Commands

```bash
# Run Rust code checks
cargo check

# Run the Clippy linter for Rust code
cargo clippy

# Format Rust code
cargo fmt

# Run Rust tests
cargo test
```

## Project Structure

### Key Directories and Files

- `/src` - Frontend React application
  - `/components` - Reusable UI components
  - `/pages` - Page components for each route
  - `/store` - Zustand state management
  - `/utils` - Utility functions including logging
  - `/styles` - CSS and theme configuration
- `/src-tauri` - Rust backend
  - `/src` - Rust source code
    - `lib.rs` - Main entry point and command registration
    - `logging.rs` - Logging functionality
    - `main.rs` - Application initialization
  - `Cargo.toml` - Rust dependencies
  - `tauri.conf.json` - Tauri configuration
- `/public` - Static assets
- `/docs` - Documentation files

## Advanced Thinking Instructions

When working with this codebase, apply these thinking approaches based on task complexity:

### Chain of Thought Reasoning

- **When to use**: For complex debugging, architectural decisions, and performance optimization
- **Structure**: Break down problems into logical steps with <thinking> tags
- **Format**:

  ```
  <thinking>
  Step 1: Analyze the component structure
  Step 2: Identify potential performance bottlenecks
  Step 3: Consider implications across language boundaries
  </thinking>

  Based on this analysis, I recommend...
  ```

- **Depth**: Include multiple perspectives and consider edge cases

### Sequential Thinking

- **When to use**: For multi-step implementations, feature planning, and complex refactoring
- **Structure**: Number steps clearly, identify dependencies, and explore alternative paths
- **Depth**: Consider potential roadblocks and mitigation strategies for each step

### Extended Thinking (Ultrathink)

- **When to use**: For especially complex architectural decisions or tricky cross-platform bugs
- **Activation**: Triggered by phrases "think harder" or "ultrathink"
- **Output**: Detailed exploration of multiple alternatives with pros/cons and implementation considerations

## Reasoning Frameworks

### For Debugging

1. Identify symptoms and expected behavior
2. Trace data flow through both React frontend and Rust backend components
3. Consider Tauri IPC mechanism as potential bottleneck
4. Implement minimal test cases
5. Propose fixes with consideration of cross-platform implications

### For Feature Implementation

1. Analyze requirements across UI (React) and backend (Rust)
2. Consider integration with existing architecture
3. Identify potential performance concerns
4. Plan implementation steps across language boundaries
5. Suggest test strategies for both frontend and Rust components

### For Code Review

1. Check adherence to project conventions
2. Identify potential performance bottlenecks
3. Verify proper error handling across language boundaries
4. Ensure security considerations, especially for Tauri's exposed APIs
5. Validate that the implementation meets requirements

### For Architecture Discussions

1. Consider cross-platform implications
2. Evaluate performance across the JS/Rust boundary
3. Assess maintainability and future extensibility
4. Analyze security implications
5. Consider developer experience and tooling support

## Quality Standards

### Code Consistency

- TypeScript code should follow existing patterns in the `/src` directory
- Rust code should follow the patterns in `/src-tauri/src`
- Maintain consistent error handling approaches across language boundaries

### Performance Considerations

- Minimize IPC calls between JavaScript and Rust
- Consider UI responsiveness impact for long-running operations
- Watch for potential memory leaks, especially in React components

### Cross-Platform Awareness

- Remember that PyrePortal targets multiple platforms
- Consider platform-specific behaviors when suggesting solutions
- Suggest testing on multiple platforms for critical features

### Security Awareness

- Be cautious with permissions and capabilities in Tauri configuration
- Consider input validation on both frontend and backend
- Be mindful of potential attack vectors in IPC communication

## Logging System

PyrePortal has a comprehensive logging system with different components:

1. **Frontend Logger** (`src/utils/logger.ts`):

   - Multiple log levels: DEBUG, INFO, WARN, ERROR
   - In-memory and persistent logging
   - Context-aware logging with source tracking

2. **Store Logger** (`src/utils/storeLogger.ts`):

   - Specialized for Zustand store actions
   - Configurable verbosity for different environments
   - Activity tracking for store changes

3. **Rust Logger** (`src-tauri/src/logging.rs`):
   - File system persistence for logs
   - Log rotation and cleanup functionality
   - Security checks on file paths

### Logging Best Practices

- Use appropriate log levels based on context
- Include relevant context data with log entries
- Never log sensitive information like PINs or tokens
- For store actions, prefer using the built-in store logger
- Refer to `docs/logging-guidelines.md` for detailed standards

## Rust-JS Interface

The application uses Tauri commands to communicate between Rust backend and JavaScript frontend:

1. Commands are defined in Rust using `#[tauri::command]`
2. They are registered in `src-tauri/src/lib.rs` using `invoke_handler(tauri::generate_handler![...])`
3. Called from the frontend using `invoke("command_name", { args })`

Example: The `write_log` command defined in `logging.rs` is invoked from the Logger class in `logger.ts`

## Environment Setup

Ensure you have the following installed:

- Node.js and npm
- Rust and Cargo
- Platform-specific dependencies for Tauri (see [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites/))

## Debugging Tips

1. **Frontend Debugging**:

   - Use the browser's developer tools when running in development mode
   - Check the in-memory logs using the `logViewer.tsx` component
   - Console logs are automatically formatted with source information

2. **Backend Debugging**:

   - Access Tauri logs in platform-specific locations:
     - Windows: `%APPDATA%\pyreportal\logs`
     - macOS: `~/Library/Logs/pyreportal`
     - Linux: `~/.config/pyreportal/logs`
   - Use the `write_log` command for persistent logging
   - Enable DevTools with `cargo tauri dev -- --devtools`

3. **Cross-Boundary Debugging**:
   - Look for IPC errors in both frontend and backend logs
   - Verify data serialization/deserialization when passing between JS and Rust
   - Check for permission issues in Tauri configuration

## Current Development Status

The application is currently using mock data instead of real API calls to the Project Phoenix backend. Future development will include:

- Real API integration with Project Phoenix
- Enhanced user authentication (biometrics, RFID/NFC)
- Offline mode with data synchronization
- Rich activity analytics and reporting
