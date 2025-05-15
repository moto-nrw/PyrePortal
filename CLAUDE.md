# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PyrePortal is a desktop application built with Tauri, React, and TypeScript. The project uses Vite as the frontend build tool and combines Rust (Tauri) for the backend with React/TypeScript for the UI.

## Architecture

- **Frontend**: React + TypeScript application built with Vite
  - Located in the `/src` directory
  - Uses Tailwind CSS for styling
- **Backend**: Rust application using Tauri framework
  - Located in the `/src-tauri` directory
  - Exposes Rust functions to the frontend via Tauri commands

The application follows the Tauri architecture where:

1. The UI is built with web technologies (React)
2. The backend logic is written in Rust
3. Communication between frontend and backend happens via Tauri's IPC mechanism

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

## Development Commands

### Frontend Development

```bash
# Install dependencies
npm install

# Run development server (frontend only)
npm run dev

# Type check TypeScript files
npm run build  # Includes TypeScript checks
```

### Tauri (Full-stack) Development

```bash
# Run the complete application in development mode
npm run tauri dev

# Build the application for production
npm run tauri build
```

## Project Configuration

- **Tauri Configuration**: Found in `src-tauri/tauri.conf.json`
- **Frontend Configuration**: Found in `vite.config.ts`
- **TypeScript Configuration**: Found in `tsconfig.json` and `tsconfig.node.json`

## Rust-JS Interface

The application uses Tauri commands to communicate between Rust backend and JavaScript frontend:

1. Commands are defined in Rust using `#[tauri::command]`
2. They are registered in `src-tauri/src/lib.rs` using `invoke_handler(tauri::generate_handler![...])`
3. Called from the frontend using `invoke("command_name", { args })`

Example: The `greet` command defined in `lib.rs` is invoked from `App.tsx`

## Environment Setup

Ensure you have the following installed:

- Node.js and npm
- Rust and Cargo
- Platform-specific dependencies for Tauri (see [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites/))

## Memories

- We use Tauri v2!
