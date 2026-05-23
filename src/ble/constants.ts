/**
 * BLE Constants for the MIDI Controller
 *
 * UUIDs and validation ranges for the ESP32-S3 BLE GATT protocol.
 * Service exposes two characteristics:
 * - ff01: CC Read/Write/Notify (3-byte messages)
 * - ff02: Bulk Read (1-byte request, 128-byte response)
 */

// GATT Service and Characteristic UUIDs
export const SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
export const CC_CHAR_UUID = '0000ff01-0000-1000-8000-00805f9b34fb';
export const BULK_CHAR_UUID = '0000ff02-0000-1000-8000-00805f9b34fb';

// Device identification
export const BLE_DEVICE_NAME = 'Controlador MIDI';

// Validation ranges
export const CHANNEL_MIN = 1;
export const CHANNEL_MAX = 16;
export const CONTROLLER_MIN = 0;
export const CONTROLLER_MAX = 127;
export const VALUE_MIN = 0;
export const VALUE_MAX = 127;

// Derived constants
export const TOTAL_CHANNELS = CHANNEL_MAX - CHANNEL_MIN + 1; // 16
export const TOTAL_CONTROLLERS = CONTROLLER_MAX - CONTROLLER_MIN + 1; // 128
export const BULK_RESPONSE_SIZE = 128; // bytes expected in bulk read response
