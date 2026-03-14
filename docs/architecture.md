# Architecture and Operation

This document describes the generic architecture and operational model of the Onkyo/Pioneer/Integra AVR integration for Unfolded Circle remotes.

## Overview

This integration uses an **event-based bidirectional communication model** with your AVR. Commands are sent to the AVR, and the AVR responds with state updates that are processed asynchronously. The AVR also sends unsolicited state updates when changes occur locally (e.g., volume adjusted on the physical remote or front panel).

## Communication Protocol

The integration uses **eISCP (Ethernet Integrated Serial Control Protocol)**, which is Onkyo's proprietary network protocol for controlling their AVRs over TCP/IP.

- **Protocol**: eISCP over TCP
- **Port**: 60128 (default)
- **Connection**: Persistent TCP socket connection
- **Format**: Text-based command/response protocol

## Architecture Components

### 1. Connection Layer

**ConnectionManager** (`src/connectionManager.ts`)
- Manages TCP socket connections (EiscpDriver instances) to one or more physical AVRs
- Handles connection lifecycle (connect, disconnect, reconnect)
- Maintains a map of physical connections (one per AVR IP address)
- Each connection contains an EISCP driver instance and command receiver

**EiscpDriver** (`src/eiscp.ts`)
- Low-level eISCP protocol implementation using Node.js `net` module
- Creates and maintains TCP socket to AVR
- Encodes outgoing commands into eISCP packet format
- Decodes incoming eISCP packets into structured command/value pairs
- Emits 'data' events when messages are received from AVR
- Implements command queuing with configurable delays to prevent overwhelming the AVR
- Handles AVR discovery via UDP broadcast

### 2. Command Flow (Outbound)

**CommandSender** (`src/commandSender.ts`)
- Receives commands from the Unfolded Circle integration API
- Translates high-level media player commands (e.g., `VolumeUp`) into eISCP protocol commands
- Routes commands to the appropriate zone (main, zone2, zone3)
- Handles connection state verification before sending commands
- Implements rate limiting for rapid commands (like volume up/down)

**Flow Example - Volume Up:**
```
User presses Volume Up on remote
    ↓
Unfolded Circle Integration API calls entity command
    ↓
CommandSender.sharedCmdHandler() receives VolumeUp command
    ↓
CommandSender calls eiscp.command("volume level-up-1db-step")
    ↓
EiscpDriver formats command to eISCP protocol: "MVLUP"
    ↓
EiscpDriver sends packet over TCP socket to AVR
    ↓
AVR receives command and adjusts volume
```

### 3. Event Flow (Inbound)

**CommandReceiver** (`src/commandReceiver.ts`)
- Listens to 'data' events emitted by the EiscpDriver
- Routes incoming messages to appropriate handlers based on command type
- Translates eISCP responses into Unfolded Circle entity attribute updates
- Maintains media metadata across multiple update messages
- Updates sensors and select entities based on AVR state

**Flow Example - Volume Update:**
```
AVR volume changes (from any source: network command, IR remote, front panel)
    ↓
AVR broadcasts state update via eISCP: "MVL32" (volume = 32)
    ↓
EiscpDriver receives packet on TCP socket
    ↓
EiscpDriver parses packet and emits 'data' event with command="volume", argument=32
    ↓
CommandReceiver.setupEiscpListener() receives event
    ↓
CommandReceiver processes volume command:
  - Converts protocol value to display value (e.g., 32 → 16 if 0.5dB steps)
  - Updates volume sensor entity
    ↓
Unfolded Circle remote UI updates to show new volume level
```

## Event-Based Model

### Unsolicited Updates
The AVR sends state updates whenever its state changes, regardless of whether the integration sent a command, a few examples:
- Volume adjusted on physical remote → AVR sends volume update
- Input changed on front panel → AVR sends input-selector update
- Track info changes during streaming → AVR sends metadata updates
- Power state changes → AVR sends system-power update

### Asynchronous Command-Response Pattern
When you send a command:
1. The command is sent immediately (non-blocking)
2. The AVR processes the command
3. The AVR sends back one or more state update events
4. The CommandReceiver processes these events asynchronously
5. Entity attributes are updated in the UI

This differs from a synchronous request-response model where you would wait for a specific response after each command.

### Multiple Updates from Single Command
A single command can trigger multiple event messages:
- Changing input might trigger: `input-selector`, `audio-information`, `video-information`, `listening-mode`, `volume`
- Playing a network service triggers: `net-service`, `title`, `artist`, `album`, `artwork`

### Streaming Data
Some information arrives as fragmented streams:
- Album art URL changes
- Metadata updates (title/artist/album) arrive as separate events
- Display text may scroll in multiple FLD (front panel display) messages

## State Management

**AvrStateManager** (`src/avrState.ts`)
- Centralized state tracking for all AVR zones
- Caches current values: power state, source, subsource, audio format
- Enables conditional logic (e.g., only process certain events when in specific source mode)

**Why Needed:**
- AVR can send lots of messages per minute during some operations
- Need to filter/deduplicate to avoid UI thrashing
- Context-dependent parsing (same command means different things in different sources)

## Zone Architecture

**Single Physical AVR, Multiple Zones:**
- One TCP connection per physical AVR
- Each zone (main, zone2, zone3) is a separate media player entity
- Commands are prefixed with zone identifier before sending to AVR
- Incoming events specify which zone they apply to
- Single CommandReceiver processes events for all zones on that AVR

**Multiple Physical AVRs:**
- Each AVR gets its own TCP connection, which is shared by all configured zone-instances of that AVR
- Each AVR has its own EiscpDriver and CommandReceiver instance
- Entities are uniquely identified: `{model}_{host}_{zone}`

## Error Handling and Resilience

### Connection Management
- **Auto-reconnection**: ReconnectionManager handles dropped connections
- **Command retry**: Commands sent while disconnected trigger reconnection attempt
- **Graceful degradation**: Entities remain available during disconnection
- **Timeout handling**: Commands that don't complete trigger retry logic

### State Synchronization
- **Query on connect**: Full state query sent when connection established
- **Query on wake**: State refreshed when AVR powers on from standby

### Message Processing
- **Queue management**: Send and receive queues prevent overwhelming AVR and this integration
- **Throttling**: Rapid repeated commands (volume) are rate-limited
- **Filtering**: Noise messages (e.g., display scrolling) are filtered out
- **Validation**: Unknown or malformed messages are safely ignored

## Command Mapping

The integration maintains extensive mapping tables:

**eiscpCommands** (`src/eiscp-commands.ts`)
- Human-readable command names → eISCP protocol codes
- E.g., `"system-power on"` → `"PWR01"`

**eiscpMappings** (`src/eiscp-mappings.ts`)
- Protocol values → human-readable values  
- E.g., `"SLI10"` → `{ command: "input-selector", value: "dvd" }`

## Performance Considerations

### Queue Thresholds
- **Send Delay** (`queueThreshold`): Minimum time between outgoing commands (default 100ms)
  - Prevents overwhelming AVR processor
  - Configurable per AVR in config.json
  - Critical for rapid commands (volume, cursor navigation)

- **Receive Delay** (`receive_delay`): Throttle for low-priority incoming messages (default 100ms)
  - Prevents UI thrashing from rapid updates
  - Only applied to video/audio info messages, not critical state updates

### Optimization Strategies
- **Command deduplication**: Same command not sent within threshold window
- **Message filtering**: Display scrolling and noise messages dropped early
- **Conditional processing**: Context-aware parsing (only process relevant data for current source)
- **Buffered metadata**: Title/artist/album accumulated before updating UI

## Debugging and Logging

The integration logs extensively to help troubleshoot issues:

- **Connection events**: Connect, disconnect, reconnect attempts
- **Command send**: All outgoing commands with entity ID and parameters
- **State updates**: All meaningful state changes with old/new values
- **Error conditions**: Connection failures, command timeouts, parsing errors
- **Raw protocol**: Optional verbose logging of raw eISCP messages

Log statements use entity ID prefix for multi-AVR/multi-zone identification.

[back to main README](../README.md#reported-to-work-on-different-brands-and-models)