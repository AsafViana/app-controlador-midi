/**
 * BLE MIDI CC Protocol Module
 *
 * Pure functions for encoding/decoding the 3-byte CC protocol.
 * No side effects — fully testable without BLE hardware.
 *
 * Protocol format:
 * - CC Message: 3 bytes [channel (1–16), controller (0–127), value (0–127)]
 * - Bulk Request: 1 byte [channel (1–16)]
 * - Bulk Response: 128 bytes [cc0_val, cc1_val, ..., cc127_val]
 *
 * All binary data is encoded/decoded as base64 strings for react-native-ble-plx.
 */

import { Buffer } from 'buffer';

import {
    BULK_RESPONSE_SIZE,
    CHANNEL_MAX,
    CHANNEL_MIN,
    CONTROLLER_MAX,
    CONTROLLER_MIN,
    VALUE_MAX,
    VALUE_MIN,
} from './constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CCMessage {
    channel: number; // 1–16
    controller: number; // 0–127
    value: number; // 0–127
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Returns true if channel is an integer in the range 1–16.
 */
export function isValidChannel(channel: number): boolean {
    return Number.isInteger(channel) && channel >= CHANNEL_MIN && channel <= CHANNEL_MAX;
}

/**
 * Returns true if controller is an integer in the range 0–127.
 */
export function isValidController(controller: number): boolean {
    return Number.isInteger(controller) && controller >= CONTROLLER_MIN && controller <= CONTROLLER_MAX;
}

/**
 * Returns true if value is an integer in the range 0–127.
 */
export function isValidValue(value: number): boolean {
    return Number.isInteger(value) && value >= VALUE_MIN && value <= VALUE_MAX;
}

/**
 * Returns true if all fields of a CCMessage are within valid ranges.
 */
export function isValidCC(msg: CCMessage): boolean {
    return isValidChannel(msg.channel) && isValidController(msg.controller) && isValidValue(msg.value);
}

// ─── Encoding ─────────────────────────────────────────────────────────────────

/**
 * Encodes a CCMessage into a base64 string (3 bytes).
 * Throws an error if the message is invalid.
 */
export function encodeCC(msg: CCMessage): string {
    if (!isValidCC(msg)) {
        throw new Error(
            `Invalid CCMessage: channel=${msg.channel}, controller=${msg.controller}, value=${msg.value}`
        );
    }

    const bytes = Buffer.from([msg.channel, msg.controller, msg.value]);
    return bytes.toString('base64');
}

/**
 * Encodes a bulk read request (1 byte channel) into a base64 string.
 * Throws an error if the channel is invalid.
 */
export function encodeBulkRequest(channel: number): string {
    if (!isValidChannel(channel)) {
        throw new Error(`Invalid channel for bulk request: ${channel}`);
    }

    const bytes = Buffer.from([channel]);
    return bytes.toString('base64');
}

// ─── Decoding ─────────────────────────────────────────────────────────────────

/**
 * Decodes a base64 string into a CCMessage.
 * Returns null if the data is invalid (short buffer, out-of-range values).
 */
export function decodeCC(base64: string): CCMessage | null {
    if (!base64) return null;

    let bytes: Buffer;
    try {
        bytes = Buffer.from(base64, 'base64');
    } catch {
        return null;
    }

    if (bytes.length < 3) return null;

    const channel = bytes[0];
    const controller = bytes[1];
    const value = bytes[2];

    if (!isValidChannel(channel)) return null;
    if (!isValidController(controller)) return null;
    if (!isValidValue(value)) return null;

    return { channel, controller, value };
}

/**
 * Decodes a base64 string into an array of 128 CC values.
 * Returns null if the decoded length is not exactly 128 bytes.
 */
export function decodeBulk(base64: string): number[] | null {
    if (!base64) return null;

    let bytes: Buffer;
    try {
        bytes = Buffer.from(base64, 'base64');
    } catch {
        return null;
    }

    if (bytes.length !== BULK_RESPONSE_SIZE) return null;

    return Array.from(bytes);
}
