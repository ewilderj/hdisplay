# Product Requirements Document: hdisplay

## Executive Summary
A lightweight display system for a 1280x400 USB monitor connected to a Raspberry Pi, featuring real-time content updates, animations, and remote control via CLI/API.

## System Architecture

### Components

1. **Display Client** (Raspberry Pi)
   - Chromium browser in kiosk mode
   - WebSocket client for real-time updates
   - Auto-recovery on connection loss
   - Runs on X11 (compatible with existing desktop environment)

2. **Display Server** 
   - Node.js + Express (excellent AI support, mature WebSocket ecosystem)
   - Socket.io for real-time bidirectional communication
   - Static file serving for web assets
   - RESTful API for content management
   - In-memory state management (no database required initially)

3. **CLI Tool**
   - Node.js-based CLI using Commander.js
   - Direct API communication
   - JSON/YAML config file support
   - Interactive and scriptable modes

## Technical Specifications

### Display Client (Browser)
- **Resolution**: 1280x400 fixed
- **Technology**: HTML5 + CSS3 + JavaScript (ES6+)
- **Framework**: Vanilla JS with Web Components for modularity
- **Features**:
  - WebSocket auto-reconnect
  - CSS animations and transitions
  - Canvas API for advanced graphics
  - Web Audio API for notifications
  - Fullscreen API
  - Local storage for offline fallback

### Server
- **Runtime**: Node.js 18+ 
- **Framework**: Express 4.x
- **Real-time**: Socket.io 4.x
- **Port**: 3000 (configurable)
- **Endpoints**:
  ```
  GET  /                    # Serves display client
  GET  /api/status          # Current display state
  POST /api/content         # Update content
  POST /api/notification    # Send notification
  GET  /api/templates       # List available templates
  POST /api/template/{id}   # Apply template
  WS   /socket             # WebSocket connection
  ```

### CLI Tool
- **Commands**:
  ```bash
  hdisplay status                        # Show current display state
  hdisplay set <content>                 # Set static content
  hdisplay notify <message> [--duration] # Send notification
  hdisplay template <name> [--data]      # Apply template
  hdisplay clear                         # Clear display
  hdisplay config [--server]             # Configure server URL
  ```

## Content Types

1. **Static HTML** - Direct HTML/CSS content
2. **Templates** - Predefined layouts with variable data
3. **Notifications** - Temporary overlays with auto-dismiss
4. **Widgets** - Modular components (clock, weather, stats)
5. **Media** - Images, videos, animated GIFs
6. **Charts** - Real-time data visualization

## Development Setup

### Directory Structure
```
hdisplay/
├── server/
│   ├── index.js           # Express server
│   ├── api/               # API routes
│   ├── sockets/           # WebSocket handlers
│   └── public/            # Static files
│       ├── index.html     # Display client
│       ├── app.js         # Client JavaScript
│       └── styles.css     # Base styles
├── cli/
│   ├── index.js           # CLI entry point
│   └── commands/          # Command implementations
├── templates/             # Display templates
├── scripts/
│   ├── setup-pi.sh        # Raspberry Pi setup
│   └── dev-server.sh      # Development server
└── examples/              # Example content
```

### Installation Process

#### Raspberry Pi Setup
```bash
# One-line installer
curl -sSL https://raw.githubusercontent.com/ewilderj/hdisplay/main/scripts/setup-pi.sh | bash
```

This script will:
1. Install Node.js and Chromium
2. Configure Chromium kiosk mode
3. Set up systemd service for auto-start
4. Configure display resolution
5. Install and start hdisplay server

#### Mac Development Setup
```bash
# Clone and install
git clone https://github.com/ewilderj/hdisplay.git
cd hdisplay
npm install
npm run dev  # Starts server + opens browser at 1280x400
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [x] Repository setup
- [ ] Basic Express server
- [ ] WebSocket connection
- [ ] Simple HTML display client
- [ ] Basic CLI with set/clear commands

### Phase 2: Content Management (Week 2)
- [ ] Template system
- [ ] Notification overlay
- [ ] Widget framework
- [ ] Enhanced CLI commands

### Phase 3: Polish & Features (Week 3)
- [ ] Animations and transitions
- [ ] Error recovery
- [ ] Configuration management
- [ ] Example templates and content

### Phase 4: Raspberry Pi Integration (Week 4)
- [ ] Setup script
- [ ] Systemd service
- [ ] Performance optimization
- [ ] Documentation

## Testing Strategy

1. **Local Development** (Mac)
   - Browser window constrained to 1280x400
   - Mock data generators
   - Hot reload for rapid iteration

2. **Integration Testing**
   - Docker container for CI/CD
   - Automated browser testing with Playwright
   - API endpoint testing

3. **Hardware Testing**
   - Real Raspberry Pi validation
   - Performance monitoring
   - Long-running stability tests

## Performance Requirements

- **Startup Time**: < 10 seconds from power-on
- **Update Latency**: < 100ms for content changes
- **Memory Usage**: < 200MB for server process
- **CPU Usage**: < 10% idle, < 30% during updates
- **Network**: Minimal bandwidth, WebSocket keep-alive

## Future Enhancements

- Multiple display support
- Mobile control app
- Plugin system for custom widgets
- MQTT integration
- Home Assistant integration
- Authentication and multi-user support
- Cloud sync for configurations

## Success Metrics

- Display runs 24/7 without crashes
- Content updates are instantaneous
- Setup takes < 5 minutes
- Works identically on Mac and Raspberry Pi
- Community can easily create custom templates