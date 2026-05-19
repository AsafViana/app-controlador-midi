/**
 * Unit tests for BLE MIDI CC Protocol edge cases.
 *
 * Validates: Requirements 11.6, 11.7, 11.8
 */

import { Buffer } from 'buffer';

import { decodeBulk, decodeCC, encodeBulkRequest, encodeCC } from '../protocol';

describe('Protocol Module - Edge Cases', () => {
    // ─── decodeCC edge cases (Requirement 11.6) ──────────────────────────────

    describe('decodeCC', () => {
        it('returns null for empty string', () => {
            expect(decodeCC('')).toBeNull();
        });

        it('returns null for 0-byte buffer', () => {
            const base64 = Buffer.alloc(0).toString('base64');
            expect(decodeCC(base64)).toBeNull();
        });

        it('returns null for 1-byte buffer', () => {
            const base64 = Buffer.from([1]).toString('base64');
            expect(decodeCC(base64)).toBeNull();
        });

        it('returns null for 2-byte buffer', () => {
            const base64 = Buffer.from([1, 64]).toString('base64');
            expect(decodeCC(base64)).toBeNull();
        });
    });

    // ─── encodeCC valid messages (Requirement 11.1) ──────────────────────────

    describe('encodeCC - valid messages', () => {
        it('produces valid base64 for minimum values {channel: 1, controller: 0, value: 0}', () => {
            const result = encodeCC({ channel: 1, controller: 0, value: 0 });
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);

            // Verify it decodes back correctly
            const decoded = decodeCC(result);
            expect(decoded).toEqual({ channel: 1, controller: 0, value: 0 });
        });

        it('produces valid base64 for maximum boundary values {channel: 16, controller: 127, value: 127}', () => {
            const result = encodeCC({ channel: 16, controller: 127, value: 127 });
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);

            // Verify it decodes back correctly
            const decoded = decodeCC(result);
            expect(decoded).toEqual({ channel: 16, controller: 127, value: 127 });
        });
    });

    // ─── encodeCC throws for invalid messages (Requirement 11.8) ─────────────

    describe('encodeCC - invalid messages', () => {
        it('throws for channel 0 (below minimum)', () => {
            expect(() => encodeCC({ channel: 0, controller: 64, value: 64 })).toThrow();
        });

        it('throws for channel 17 (above maximum)', () => {
            expect(() => encodeCC({ channel: 17, controller: 64, value: 64 })).toThrow();
        });

        it('throws for controller 128 (above maximum)', () => {
            expect(() => encodeCC({ channel: 1, controller: 128, value: 64 })).toThrow();
        });

        it('throws for value 128 (above maximum)', () => {
            expect(() => encodeCC({ channel: 1, controller: 64, value: 128 })).toThrow();
        });
    });

    // ─── encodeBulkRequest (Requirement 11.4) ────────────────────────────────

    describe('encodeBulkRequest - valid channels', () => {
        it('produces correct base64 for channel 1', () => {
            const result = encodeBulkRequest(1);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);

            // Verify the encoded byte is correct
            const decoded = Buffer.from(result, 'base64');
            expect(decoded.length).toBe(1);
            expect(decoded[0]).toBe(1);
        });

        it('produces correct base64 for channel 16', () => {
            const result = encodeBulkRequest(16);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);

            // Verify the encoded byte is correct
            const decoded = Buffer.from(result, 'base64');
            expect(decoded.length).toBe(1);
            expect(decoded[0]).toBe(16);
        });
    });

    describe('encodeBulkRequest - invalid channels', () => {
        it('throws for channel 0 (below minimum)', () => {
            expect(() => encodeBulkRequest(0)).toThrow();
        });

        it('throws for channel 17 (above maximum)', () => {
            expect(() => encodeBulkRequest(17)).toThrow();
        });
    });

    // ─── decodeBulk edge cases (Requirement 11.7) ────────────────────────────

    describe('decodeBulk', () => {
        it('returns null for 127 bytes (one less than expected)', () => {
            const base64 = Buffer.alloc(127, 0).toString('base64');
            expect(decodeBulk(base64)).toBeNull();
        });

        it('returns null for 129 bytes (one more than expected)', () => {
            const base64 = Buffer.alloc(129, 0).toString('base64');
            expect(decodeBulk(base64)).toBeNull();
        });

        it('returns correct array for exactly 128 bytes', () => {
            const values = Array.from({ length: 128 }, (_, i) => i % 128);
            const base64 = Buffer.from(values).toString('base64');
            const result = decodeBulk(base64);

            expect(result).not.toBeNull();
            expect(result).toHaveLength(128);
            expect(result).toEqual(values);
        });
    });
});
