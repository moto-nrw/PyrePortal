# PyrePortal

![PyrePortal](public/img/moto_transparent_200.png)

[![Tauri](https://img.shields.io/badge/tauri-v2-blue)](https://tauri.app)
[![React](https://img.shields.io/badge/react-18.3.1-blue)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.6.2-blue)](https://www.typescriptlang.org)
[![Version](https://img.shields.io/badge/version-0.1.0-green)](package.json)

## Overview

PyrePortal is a desktop application built with Tauri, React, and TypeScript that serves as a client for the Project Phoenix system. It provides an intuitive interface for managing room occupancy and activities in educational or organizational settings, allowing users to check into rooms, monitor room status, and create activities.

### Key Features

- **✅ Real API Integration**: Teacher list fetched from live backend API
- **User Authentication**: Secure login with PIN verification
- **Room Selection**: View and select available rooms with real-time status
- **Activity Management**: Create and track activities with category selection
- **Comprehensive Logging**: Detailed logging of user actions and system events
- **Cross-Platform**: Runs on Windows, macOS, and Linux

## 🚀 Implementation Status

### ✅ Completed Features

- **Teacher List API Integration** (June 10, 2025)
  - Real-time teacher data from backend API
  - Device authentication with API key
  - Single request with deduplication
  - Error handling and loading states
  - Environment-based configuration

### 🏗️ In Development

- PIN validation via `/api/iot/status`
- Room selection from backend
- RFID tag assignment workflow
- Activity session management
- Student check-in/check-out with RFID

### 📋 Planned Features

- Complete offline support
- Advanced error recovery
- Session timeout management
- Comprehensive audit logging

## Architecture

PyrePortal follows a modern desktop application architecture using Tauri's capabilities to combine web technologies with native performance.

```mermaid
flowchart TB
    subgraph "PyrePortal Desktop Application"
        UI[React Frontend] --> |Tauri IPC| Backend[Tauri/Rust Backend]
        Backend --> |Invoke| UI
        UI --> |State Management| State[Zustand Store]
        State --> UI
    end

    subgraph "Project Phoenix"
        Server[Backend Server] --> |API| Database[(Database)]
        WebUI[Web Frontend] --> |API| Server
    end

    Backend --> |API Calls| Server

    Note[✅ Teacher List API: IMPLEMENTED\n⏳ Other APIs: Mock data (planned)]
    Backend --- Note
```

### Components

- **React Frontend**: User interface built with React 18 and TypeScript
- **Tauri/Rust Backend**: Native functionality and system integration
- **Zustand Store**: State management for user data, rooms, and activities
- **Project Phoenix API**: Integration with the server backend (currently mocked)

## Tech Stack

| Component        | Technology   | Version |
| ---------------- | ------------ | ------- |
| Framework        | Tauri        | v2      |
| Frontend Library | React        | 18.3.1  |
| Language         | TypeScript   | 5.6.2   |
| State Management | Zustand      | 5.0.4   |
| Routing          | React Router | 7.6.0   |
| Styling          | TailwindCSS  | 4.1.6   |
| Build Tool       | Vite         | 6.0.3   |

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- Platform-specific dependencies for Tauri:
  - [Windows](https://tauri.app/v1/guides/getting-started/prerequisites#setting-up-windows)
  - [macOS](https://tauri.app/v1/guides/getting-started/prerequisites#setting-up-macos)
  - [Linux](https://tauri.app/v1/guides/getting-started/prerequisites#setting-up-linux)

### Development Setup

1. Clone the repository

   ```bash
   git clone https://github.com/yourusername/pyreportal.git
   cd pyreportal
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Run in development mode
   ```bash
   npm run tauri dev
   ```

### Building for Production

1. Build the application

   ```bash
   npm run tauri build
   ```

2. Find the packaged application in the `src-tauri/target/release/bundle` directory

## Usage

<details>
<summary>User Authentication</summary>

PyrePortal uses a PIN-based authentication system. Enter your PIN on the login screen to access the application.

![Login Screen](public/img/placeholder_nfc_scan.png)

</details>

<details>
<summary>Room Selection</summary>

After logging in, select a room from the room selection screen. Rooms are displayed with their current status:

- ![Checked In](public/img/checked_in.png) Room is occupied
- ![Checked Out](public/img/checked_out.png) Room is available

Rooms are categorized by type, including:

- ![School Yard](public/img/school_yard_icon.png) School Yard
- ![Toilet](public/img/toilet_icon.png) Toilet
</details>

<details>
<summary>Activity Creation</summary>

Create new activities by selecting the activity type, assigning a supervisor, and setting other relevant details. The system provides feedback with satisfaction indicators:

- ![Positive](public/img/positive_smiley1.png) Positive
- ![Neutral](public/img/neutral_smiley1.png) Neutral
- ![Negative](public/img/negative_smiley1.png) Negative
</details>

## API Integration with Project Phoenix

> **Note**: The current implementation uses mock data. This section describes the planned integration with Project Phoenix.

### Endpoints

PyrePortal will communicate with the Project Phoenix server through the following endpoints:

| Endpoint                | Method | Description           |
| ----------------------- | ------ | --------------------- |
| `/api/auth`             | POST   | User authentication   |
| `/api/rooms`            | GET    | Get available rooms   |
| `/api/rooms/:id`        | GET    | Get room details      |
| `/api/rooms/:id/select` | POST   | Select a room         |
| `/api/activities`       | POST   | Create a new activity |

### Authentication Flow

1. User enters PIN in PyrePortal
2. PyrePortal sends authentication request to Project Phoenix
3. Project Phoenix validates credentials and returns a session token
4. PyrePortal stores token for subsequent API calls

### Integration Points

The integration with Project Phoenix will be implemented in the following files:

- `src/store/userStore.ts` - Replace mock API calls with real HTTP requests
- `src-tauri/src/lib.rs` - Add authentication and API proxy commands

## Troubleshooting

<details>
<summary>Common Issues</summary>

### Application Won't Start

- Ensure all prerequisites are installed correctly
- Check logs in `~/.config/pyreportal/logs/` (Linux/macOS) or `%APPDATA%\pyreportal\logs\` (Windows)
- Verify Tauri dependencies are installed for your platform

### Build Errors

- Run `cargo clean` in the `src-tauri` directory to clean Rust build artifacts
- Ensure you have the latest Rust toolchain with `rustup update`
- Check that all npm dependencies are installed with `npm install`

### Connection Issues

- Verify that mock data is being used (current implementation)
- Check network connectivity for future Project Phoenix integration
- Ensure firewall settings allow PyrePortal to connect to the server

</details>

## Future Development

- [ ] Real API integration with Project Phoenix
- [ ] Offline mode with data synchronization
- [ ] Enhanced user authentication (biometrics, RFID/NFC)
- [ ] Rich activity analytics and reporting
- [ ] Multi-language support
- [ ] Dark mode theme
- [ ] Mobile companion application

## Contributing

Contributions to PyrePortal are welcome! Please see our [contributing guidelines](CONTRIBUTING.md) for more information.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ using [Tauri](https://tauri.app), [React](https://reactjs.org), and [TypeScript](https://www.typescriptlang.org)
