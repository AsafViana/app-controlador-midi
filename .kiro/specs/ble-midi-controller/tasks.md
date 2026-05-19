# Implementation Plan: BLE MIDI Controller

## Overview

This plan implements a React Native (Expo SDK 54) app that connects to an ESP32-S3 BLE MIDI Controller via Bluetooth Low Energy. The implementation follows a bottom-up approach: protocol layer → state management → BLE service → UI components → integration. TypeScript is used throughout with `react-native-ble-plx` for BLE, Zustand for state, and `fast-check` for property-based testing.

## Tasks

- [x] 1. Install dependencies and configure project
  - [x] 1.1 Install runtime dependencies and configure Expo plugins
    - Install `react-native-ble-plx` ^3.x, `buffer` ^6.x, `@react-native-community/slider` ^4.x, `zustand` ^5.x
    - Install dev dependencies: `jest-expo` ~54.x, `fast-check` ^3.x, `@testing-library/react-native` ^12.x, `@types/jest` ^29.x
    - Add `react-native-ble-plx` config plugin to `app.json` for iOS BLE permissions and background modes
    - Configure `jest-expo` preset in `package.json` or `jest.config.js`
    - Add test scripts to `package.json`: `"test": "jest --run"`, `"test:property": "jest --testPathPattern=property --run"`
    - _Requirements: 12.1, 12.2_

  - [x] 1.2 Create directory structure and BLE constants
    - Create `src/ble/`, `src/stores/`, `src/services/`, `src/hooks/`, `src/components/` directories
    - Create `src/ble/constants.ts` with SERVICE_UUID, CC_CHAR_UUID, BULK_CHAR_UUID, BLE_DEVICE_NAME, and validation range constants
    - _Requirements: 11.1, 11.4_

- [x] 2. Implement protocol module
  - [x] 2.1 Implement CC encode/decode functions (`src/ble/protocol.ts`)
    - Implement `CCMessage` interface with channel (1–16), controller (0–127), value (0–127)
    - Implement `encodeCC(msg: CCMessage): string` — encodes 3 bytes to base64 using Buffer
    - Implement `decodeCC(base64: string): CCMessage | null` — decodes base64 to CCMessage, returns null for invalid data
    - Implement `encodeBulkRequest(channel: number): string` — encodes 1 byte channel to base64
    - Implement `decodeBulk(base64: string): number[] | null` — decodes 128-byte base64 to array, returns null if length ≠ 128
    - Implement validation functions: `isValidCC`, `isValidChannel`, `isValidController`, `isValidValue`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [x] 2.2 Write property test: CC Message Round-Trip
    - **Property 1: CC Message Round-Trip**
    - **Validates: Requirements 11.1, 11.2, 11.5, 4.1, 5.1**
    - File: `src/ble/__tests__/protocol.property.test.ts`
    - Generate random valid CCMessage (channel 1–16, controller 0–127, value 0–127)
    - Assert `decodeCC(encodeCC(msg))` produces identical channel, controller, value

  - [x] 2.3 Write property test: CC Validation Rejects Invalid Messages
    - **Property 2: CC Validation Rejects Invalid Messages**
    - **Validates: Requirements 4.4, 5.3, 5.4, 5.5, 6.3, 11.6, 11.8**
    - File: `src/ble/__tests__/protocol.property.test.ts`
    - Generate random invalid CCMessage (channel outside 1–16, controller > 127, value > 127, or short buffers)
    - Assert `decodeCC` returns null and `isValidCC` returns false

  - [x] 2.4 Write property test: Bulk Read Round-Trip
    - **Property 3: Bulk Read Round-Trip**
    - **Validates: Requirements 11.3, 11.4, 3.2, 6.2**
    - File: `src/ble/__tests__/protocol.property.test.ts`
    - Generate random array of exactly 128 values (each 0–127)
    - Encode to base64 via Buffer, then decode via `decodeBulk`
    - Assert decoded array is identical to original

  - [x] 2.5 Write property test: Bulk Decode Rejects Invalid Length
    - **Property 4: Bulk Decode Rejects Invalid Length**
    - **Validates: Requirements 11.7**
    - File: `src/ble/__tests__/protocol.property.test.ts`
    - Generate random byte arrays with length ≠ 128
    - Assert `decodeBulk` returns null

  - [x] 2.6 Write unit tests for protocol edge cases
    - File: `src/ble/__tests__/protocol.test.ts`
    - Test `decodeCC("")` returns null (empty string)
    - Test `decodeCC` with 0-byte, 1-byte, 2-byte buffers returns null
    - Test `encodeCC({1, 0, 0})` produces valid base64
    - Test `encodeCC({16, 127, 127})` boundary values
    - Test `decodeBulk` with 127 bytes and 129 bytes returns null
    - _Requirements: 11.6, 11.7, 11.8_

- [x] 3. Implement state management
  - [x] 3.1 Implement CC Store (`src/stores/cc-store.ts`)
    - Create Zustand store with `values: number[][]` (16×128 matrix initialized to 0)
    - Implement `updateCC(channel, controller, value)` — updates single cell
    - Implement `updateChannel(channel, values)` — replaces all 128 values atomically
    - Implement `updateAllChannels(allValues)` — replaces all 16 channels
    - Implement `resetAll()` — resets all values to 0
    - Implement selectors: `getCC(channel, controller)`, `getChannel(channel)`
    - _Requirements: 3.2, 4.2, 5.2, 6.2, 8.1_

  - [x] 3.2 Write property test: CC Store Update Correctness
    - **Property 5: CC Store Update Correctness**
    - **Validates: Requirements 4.2, 5.2, 3.2, 6.2**
    - File: `src/stores/__tests__/cc-store.property.test.ts`
    - Generate random (channel 1–16, controller 0–127, value 0–127)
    - Call `updateCC`, assert `values[channel-1][controller] === value`
    - Assert all other cells remain unchanged

  - [x] 3.3 Write unit tests for CC Store
    - File: `src/stores/__tests__/cc-store.test.ts`
    - Test initial state is 16×128 zeros
    - Test `updateChannel` replaces all 128 values atomically
    - Test `updateAllChannels` replaces all channels
    - Test `resetAll` returns to initial state
    - _Requirements: 3.2, 4.2, 6.2_

  - [x] 3.4 Implement Connection Store (`src/stores/connection-store.ts`)
    - Create Zustand store with `state: ConnectionState`, `reconnectAttempt`, `syncProgress`, `error`
    - Define `ConnectionState` type: 'disconnected' | 'scanning' | 'connecting' | 'syncing' | 'connected' | 'reconnecting' | 'bluetooth_unavailable'
    - Implement actions: `setState`, `setReconnectAttempt`, `setSyncProgress`, `setError`, `reset`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement BLE service layer
  - [x] 5.1 Implement Permission Service (`src/services/permission-service.ts`)
    - Implement `requestBLEPermissions()` for Android (BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION)
    - Implement iOS path (permissions handled via Info.plist, just check Bluetooth state)
    - Implement `checkBluetoothEnabled()` using BleManager state subscription
    - Return `{ granted: boolean, bluetoothEnabled: boolean }`
    - _Requirements: 1.5, 1.6, 12.1, 12.3, 12.4, 12.5_

  - [x] 5.2 Implement BLE Service (`src/ble/ble-service.ts`)
    - Create `BLEService` class wrapping `BleManager` from react-native-ble-plx
    - Implement `scan()`: filter by SERVICE_UUID and device name "Controlador MIDI BLE", 10s timeout
    - Implement `connect(device)`: request MTU 185, discover services, validate ff01 characteristic exists
    - Implement `disconnect()`: cancel connection, mark as user-initiated
    - Implement `enableNotifications()`: monitor CC_CHAR_UUID, decode via protocol module
    - Implement `writeCC(msg)`: encode via protocol, write with response to CC_CHAR_UUID, 5s timeout
    - Implement `bulkRead(channel)`: write channel to BULK_CHAR_UUID, read 128-byte response, 5s timeout
    - Implement `syncAllChannels(onProgress)`: sequential bulk read for channels 1–16
    - Implement `destroy()`: cleanup BleManager instance
    - Expose callbacks: `onCCNotification`, `onConnectionStateChange`
    - _Requirements: 1.1, 1.2, 1.3, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 5.1, 6.1, 6.4, 6.5_

  - [x] 5.3 Implement reconnection logic in BLE Service
    - Detect unexpected disconnection via `onDisconnected` callback
    - Wait 1s initial delay, then retry up to 5 times with 2s interval
    - On successful reconnect: rediscover services, re-enable notifications, re-sync all channels
    - On max retries exceeded: transition to 'disconnected' state with error message
    - Skip reconnection if disconnect was user-initiated
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 5.4 Write unit tests for BLE Service
    - File: `src/ble/__tests__/ble-service.test.ts`
    - Mock `BleManager` from react-native-ble-plx
    - Test scan timeout after 10s returns null
    - Test scan finds device by name and SERVICE_UUID
    - Test connect requests MTU 185 and discovers services
    - Test disconnect marks as user-initiated
    - Test writeCC encodes and writes to correct characteristic
    - Test reconnection attempts up to 5 times
    - Test reconnection stops on user-initiated disconnect
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 7.1, 7.4, 7.5_

- [x] 6. Implement orchestration hook
  - [x] 6.1 Implement `useBLEController` hook (`src/hooks/useBLEController.ts`)
    - Wire BLE Service with CC Store and Connection Store
    - Implement `scanAndConnect()`: request permissions → scan → connect → enable notifications → sync all channels
    - Implement `disconnect()`: mark user-initiated, call BLE service disconnect
    - Implement `sendCC(channel, controller, value)`: validate → optimistic update → write → rollback on failure
    - Implement `syncChannel(channel)`: bulk read → update CC Store
    - Subscribe to BLE notifications → update CC Store on incoming CC changes
    - Subscribe to connection state changes → update Connection Store
    - Handle errors: propagate to Connection Store error field
    - _Requirements: 1.5, 2.3, 3.1, 4.1, 4.2, 5.1, 5.2, 5.6, 6.1, 7.1, 8.4, 8.5_

  - [x] 6.2 Write unit tests for useBLEController hook
    - File: `src/hooks/__tests__/useBLEController.test.ts`
    - Mock BLE Service and stores
    - Test scanAndConnect flow: permissions → scan → connect → notify → sync
    - Test sendCC with optimistic update and rollback on failure
    - Test notification updates CC Store
    - Test disconnect marks user-initiated
    - _Requirements: 4.2, 5.2, 5.6, 7.5_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement UI components
  - [x] 8.1 Implement ConnectionStatus component (`src/components/ConnectionStatus.tsx`)
    - Fixed header badge showing BLE connection state
    - Color-coded states: disconnected (gray), scanning (blue), connecting (yellow), syncing (yellow), connected (green), reconnecting (orange), bluetooth_unavailable (red)
    - Display reconnect attempt number when in 'reconnecting' state
    - Subscribe to Connection Store for reactive updates
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 8.2 Implement ChannelSelector component (`src/components/ChannelSelector.tsx`)
    - Horizontal row of 16 channel buttons (1–16)
    - Visual highlight on selected channel (distinct contrast)
    - Default selection: channel 1
    - Call `onChannelChange` callback when user selects a different channel
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 8.3 Implement CCSlider component (`src/components/CCSlider.tsx`)
    - Use `@react-native-community/slider` with min=0, max=127, step=1
    - Display CC number label and current numeric value (0–127)
    - Call `onValueChange` during sliding for visual feedback (< 100ms)
    - Call `onSlidingComplete` with final value for BLE write
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 8.4 Implement CCGrid component (`src/components/CCGrid.tsx`)
    - Scrollable FlatList/ScrollView rendering 128 CCSlider components for selected channel
    - Subscribe to CC Store for the selected channel's values
    - Use selectors to prevent unnecessary re-renders (only re-render changed sliders)
    - _Requirements: 8.1, 8.6, 4.3, 4.5_

  - [x] 8.5 Implement ScanButton component (`src/components/ScanButton.tsx`)
    - Show "Conectar" when disconnected, "Escaneando..." when scanning, "Desconectar" when connected
    - Trigger `scanAndConnect()` or `disconnect()` from useBLEController hook
    - Disable button during scanning/connecting states
    - _Requirements: 1.2, 1.4, 2.1_

  - [x] 8.6 Implement SyncProgress component (`src/components/SyncProgress.tsx`)
    - Show progress indicator during bulk sync (channel X of 16)
    - Subscribe to Connection Store syncProgress field
    - Hide when sync is complete or not in progress
    - _Requirements: 3.3, 3.5_

- [x] 9. Integrate UI into app screens
  - [x] 9.1 Create main controller screen (`app/(tabs)/index.tsx`)
    - Compose ConnectionStatus, ChannelSelector, CCGrid, ScanButton, SyncProgress
    - Wire useBLEController hook to all components
    - Handle channel selection: update CCGrid, trigger bulk read if channel not yet synced
    - Handle slider interaction: call sendCC on sliding complete
    - Handle error display: show error messages from Connection Store
    - _Requirements: 8.4, 8.5, 8.7, 9.1, 10.2, 10.4_

  - [x] 9.2 Update app layout (`app/_layout.tsx`)
    - Ensure ConnectionStatus is visible across all screens (fixed position)
    - Configure navigation structure for the controller app
    - _Requirements: 9.1_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Component tests
  - [x] 11.1 Write component tests for UI
    - File: `src/components/__tests__/ConnectionStatus.test.tsx`
    - Test renders correct label and color for each ConnectionState
    - File: `src/components/__tests__/ChannelSelector.test.tsx`
    - Test renders 16 buttons, highlights selected, fires callback
    - File: `src/components/__tests__/CCSlider.test.tsx`
    - Test displays value, fires onSlidingComplete
    - _Requirements: 9.2, 10.1, 10.3, 8.2, 8.3_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The protocol module (task 2) is pure and fully testable without BLE hardware
- BLE Service (task 5) requires mocking react-native-ble-plx for unit tests
- UI components (task 8) can be developed in parallel once stores are ready
- Read Expo SDK 54 docs at <https://docs.expo.dev/versions/v54.0.0/> before implementing any Expo-specific code

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.4"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "5.1"] },
    { "id": 4, "tasks": ["5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "8.1", "8.2", "8.3", "8.5", "8.6"] },
    { "id": 8, "tasks": ["8.4"] },
    { "id": 9, "tasks": ["9.1", "9.2"] },
    { "id": 10, "tasks": ["11.1"] }
  ]
}
```
