/**
 * Property-Based Tests for BLE MIDI CC Protocol Module
 *
 * Uses fast-check to verify universal correctness properties
 * of the protocol encoding/decoding functions.
 *
 * Feature: ble-midi-controller
 */

import { Buffer } from 'buffer';
import * as fc from 'fast-check';

import type { CCMessage } from '../../ble/protocol';
import { decodeBulk, decodeCC, encodeCC, isValidCC } from '../../ble/protocol';

const NUM_RUNS = 100;

describe('Feature: ble-midi-controller, Property 1: CC Message Round-Trip', () => {
    /**
     * Validates: Requirements 11.1, 11.2, 11.5, 4.1, 5.1
     *
     * For any valid CC message with channel in 1–16, controller in 0–127,
     * and value in 0–127, encoding the message to base64 via encodeCC and
     * then decoding it back via decodeCC SHALL produce a message with
     * identical channel, controller, and value fields.
     */
    it('encodeCC followed by decodeCC produces identical message', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 16 }),
                fc.integer({ min: 0, max: 127 }),
                fc.integer({ min: 0, max: 127 }),
                (channel, controller, value) => {
                    const original: CCMessage = { channel, controller, value };
                    const encoded = encodeCC(original);
                    const decoded = decodeCC(encoded);

                    expect(decoded).not.toBeNull();
                    expect(decoded!.channel).toBe(channel);
                    expect(decoded!.controller).toBe(controller);
                    expect(decoded!.value).toBe(value);
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });
});

describe('Feature: ble-midi-controller, Property 2: CC Validation Rejects Invalid Messages', () => {
    /**
     * Validates: Requirements 4.4, 5.3, 5.4, 5.5, 6.3, 11.6, 11.8
     *
     * For any CC message where channel is outside 1–16, OR controller is
     * outside 0–127, OR value is outside 0–127, OR the base64 payload
     * decodes to fewer than 3 bytes, the decodeCC function SHALL return
     * null and the isValidCC function SHALL return false.
     */
    it('rejects messages with channel outside 1–16', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 17, max: 255 }),
                fc.integer({ min: 0, max: 127 }),
                fc.integer({ min: 0, max: 127 }),
                (channel, controller, value) => {
                    const msg: CCMessage = { channel, controller, value };
                    expect(isValidCC(msg)).toBe(false);

                    // Encode raw bytes and try to decode
                    const bytes = Buffer.from([channel, controller, value]);
                    const base64 = bytes.toString('base64');
                    expect(decodeCC(base64)).toBeNull();
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });

    it('rejects messages with channel 0', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 127 }),
                fc.integer({ min: 0, max: 127 }),
                (controller, value) => {
                    const msg: CCMessage = { channel: 0, controller, value };
                    expect(isValidCC(msg)).toBe(false);

                    const bytes = Buffer.from([0, controller, value]);
                    const base64 = bytes.toString('base64');
                    expect(decodeCC(base64)).toBeNull();
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });

    it('rejects messages with controller outside 0–127', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 16 }),
                fc.integer({ min: 128, max: 255 }),
                fc.integer({ min: 0, max: 127 }),
                (channel, controller, value) => {
                    const msg: CCMessage = { channel, controller, value };
                    expect(isValidCC(msg)).toBe(false);

                    const bytes = Buffer.from([channel, controller, value]);
                    const base64 = bytes.toString('base64');
                    expect(decodeCC(base64)).toBeNull();
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });

    it('rejects messages with value outside 0–127', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 16 }),
                fc.integer({ min: 0, max: 127 }),
                fc.integer({ min: 128, max: 255 }),
                (channel, controller, value) => {
                    const msg: CCMessage = { channel, controller, value };
                    expect(isValidCC(msg)).toBe(false);

                    const bytes = Buffer.from([channel, controller, value]);
                    const base64 = bytes.toString('base64');
                    expect(decodeCC(base64)).toBeNull();
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });

    it('rejects short buffers (fewer than 3 bytes)', () => {
        fc.assert(
            fc.property(
                fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 2 }),
                (byteArray) => {
                    const bytes = Buffer.from(byteArray);
                    const base64 = bytes.toString('base64');
                    expect(decodeCC(base64)).toBeNull();
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });
});

describe('Feature: ble-midi-controller, Property 3: Bulk Read Round-Trip', () => {
    /**
     * Validates: Requirements 11.3, 11.4, 3.2, 6.2
     *
     * For any array of exactly 128 values where each value is in the range
     * 0–127, encoding the array to base64 and then decoding it via decodeBulk
     * SHALL produce an array identical to the original.
     */
    it('encoding 128 values to base64 and decoding via decodeBulk produces identical array', () => {
        fc.assert(
            fc.property(
                fc.array(fc.integer({ min: 0, max: 127 }), { minLength: 128, maxLength: 128 }),
                (values) => {
                    const bytes = Buffer.from(values);
                    const base64 = bytes.toString('base64');
                    const decoded = decodeBulk(base64);

                    expect(decoded).not.toBeNull();
                    expect(decoded).toHaveLength(128);
                    expect(decoded).toEqual(values);
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });
});

describe('Feature: ble-midi-controller, Property 4: Bulk Decode Rejects Invalid Length', () => {
    /**
     * Validates: Requirements 11.7
     *
     * For any base64 string that decodes to a byte array with length
     * different from 128, the decodeBulk function SHALL return null.
     */
    it('rejects byte arrays with length ≠ 128', () => {
        fc.assert(
            fc.property(
                fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 256 }).filter(
                    (arr) => arr.length !== 128
                ),
                (byteArray) => {
                    const bytes = Buffer.from(byteArray);
                    const base64 = bytes.toString('base64');
                    expect(decodeBulk(base64)).toBeNull();
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });
});
