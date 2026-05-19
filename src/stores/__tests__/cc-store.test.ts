import { TOTAL_CHANNELS, TOTAL_CONTROLLERS } from '../../ble/constants';
import { useCCStore } from '../cc-store';

describe('CC Store', () => {
    beforeEach(() => {
        useCCStore.getState().resetAll();
    });

    describe('initial state', () => {
        it('should have 16 channels', () => {
            const { values } = useCCStore.getState();
            expect(values.length).toBe(TOTAL_CHANNELS);
        });

        it('should have 128 controllers per channel', () => {
            const { values } = useCCStore.getState();
            for (const channel of values) {
                expect(channel.length).toBe(TOTAL_CONTROLLERS);
            }
        });

        it('should initialize all values to 0', () => {
            const { values } = useCCStore.getState();
            for (const channel of values) {
                for (const value of channel) {
                    expect(value).toBe(0);
                }
            }
        });
    });

    describe('updateCC', () => {
        it('should update a single CC value (1-indexed channel)', () => {
            useCCStore.getState().updateCC(1, 74, 100);
            expect(useCCStore.getState().values[0][74]).toBe(100);
        });

        it('should update channel 16 correctly', () => {
            useCCStore.getState().updateCC(16, 127, 127);
            expect(useCCStore.getState().values[15][127]).toBe(127);
        });

        it('should not affect other cells', () => {
            useCCStore.getState().updateCC(1, 74, 100);
            expect(useCCStore.getState().values[0][73]).toBe(0);
            expect(useCCStore.getState().values[0][75]).toBe(0);
            expect(useCCStore.getState().values[1][74]).toBe(0);
        });
    });

    describe('updateChannel', () => {
        it('should replace all 128 values for a channel atomically', () => {
            const newValues = Array.from({ length: 128 }, (_, i) => i);
            useCCStore.getState().updateChannel(1, newValues);

            const channel = useCCStore.getState().values[0];
            for (let i = 0; i < 128; i++) {
                expect(channel[i]).toBe(i);
            }
        });

        it('should not affect other channels', () => {
            const newValues = Array.from({ length: 128 }, () => 64);
            useCCStore.getState().updateChannel(2, newValues);

            // Channel 1 should still be all zeros
            const ch1 = useCCStore.getState().values[0];
            for (const val of ch1) {
                expect(val).toBe(0);
            }
        });
    });

    describe('updateAllChannels', () => {
        it('should replace all channels', () => {
            const allValues = Array.from({ length: 16 }, (_, ch) =>
                Array.from({ length: 128 }, () => ch + 1)
            );
            useCCStore.getState().updateAllChannels(allValues);

            for (let ch = 0; ch < 16; ch++) {
                for (let cc = 0; cc < 128; cc++) {
                    expect(useCCStore.getState().values[ch][cc]).toBe(ch + 1);
                }
            }
        });

        it('should skip null entries (keep existing values)', () => {
            // Set channel 1 to all 50s
            useCCStore.getState().updateChannel(1, Array(128).fill(50));

            // Update all channels but pass null for channel 1
            const allValues: (number[] | null)[] = Array.from({ length: 16 }, (_, i) =>
                i === 0 ? null : Array(128).fill(99)
            );
            useCCStore.getState().updateAllChannels(allValues);

            // Channel 1 should still be 50s
            expect(useCCStore.getState().values[0][0]).toBe(50);
            expect(useCCStore.getState().values[0][127]).toBe(50);

            // Other channels should be 99
            expect(useCCStore.getState().values[1][0]).toBe(99);
            expect(useCCStore.getState().values[15][127]).toBe(99);
        });
    });

    describe('resetAll', () => {
        it('should reset all values to 0', () => {
            useCCStore.getState().updateCC(1, 0, 127);
            useCCStore.getState().updateCC(16, 127, 64);
            useCCStore.getState().resetAll();

            const { values } = useCCStore.getState();
            for (const channel of values) {
                for (const value of channel) {
                    expect(value).toBe(0);
                }
            }
        });
    });

    describe('selectors', () => {
        it('getCC should return the correct value (1-indexed channel)', () => {
            useCCStore.getState().updateCC(3, 10, 42);
            expect(useCCStore.getState().getCC(3, 10)).toBe(42);
        });

        it('getChannel should return all 128 values for a channel', () => {
            const newValues = Array.from({ length: 128 }, (_, i) => i % 128);
            useCCStore.getState().updateChannel(5, newValues);

            const channel = useCCStore.getState().getChannel(5);
            expect(channel.length).toBe(128);
            for (let i = 0; i < 128; i++) {
                expect(channel[i]).toBe(i % 128);
            }
        });
    });
});
