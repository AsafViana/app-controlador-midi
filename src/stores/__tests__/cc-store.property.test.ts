/**
 * Property-Based Tests for CC Store
 *
 * Uses fast-check to verify universal correctness properties
 * of the CC Store state management.
 *
 * Feature: ble-midi-controller
 */

import * as fc from 'fast-check';

import { useCCStore } from '../cc-store';

const NUM_RUNS = 100;

describe('Feature: ble-midi-controller, Property 5: CC Store Update Correctness', () => {
    /**
     * Validates: Requirements 4.2, 5.2, 3.2, 6.2
     *
     * For any valid CC message (channel 1–16, controller 0–127, value 0–127),
     * calling updateCC(channel, controller, value) on the CC Store SHALL result
     * in values[channel - 1][controller] being equal to value, while all other
     * cells in the store remain unchanged.
     */

    beforeEach(() => {
        useCCStore.getState().resetAll();
    });

    it('updateCC sets the correct cell to the given value', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 16 }),
                fc.integer({ min: 0, max: 127 }),
                fc.integer({ min: 0, max: 127 }),
                (channel, controller, value) => {
                    useCCStore.getState().resetAll();

                    useCCStore.getState().updateCC(channel, controller, value);

                    const state = useCCStore.getState();
                    expect(state.values[channel - 1][controller]).toBe(value);
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });

    it('updateCC does not modify any other cell in the store', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 16 }),
                fc.integer({ min: 0, max: 127 }),
                fc.integer({ min: 0, max: 127 }),
                (channel, controller, value) => {
                    useCCStore.getState().resetAll();

                    // Capture state before update
                    const before = useCCStore.getState().values.map((ch) => [...ch]);

                    useCCStore.getState().updateCC(channel, controller, value);

                    const after = useCCStore.getState().values;

                    // Check all cells except the updated one remain unchanged
                    for (let ch = 0; ch < 16; ch++) {
                        for (let cc = 0; cc < 128; cc++) {
                            if (ch === channel - 1 && cc === controller) {
                                continue; // skip the updated cell
                            }
                            expect(after[ch][cc]).toBe(before[ch][cc]);
                        }
                    }
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });
});
