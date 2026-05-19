import { create } from 'zustand';
import { TOTAL_CHANNELS, TOTAL_CONTROLLERS } from '../ble/constants';

/**
 * Creates a 16×128 matrix initialized to 0.
 * values[channelIndex][controllerNumber], where channelIndex = channel - 1.
 */
function createInitialValues(): number[][] {
    return Array.from({ length: TOTAL_CHANNELS }, () =>
        new Array(TOTAL_CONTROLLERS).fill(0)
    );
}

export interface CCStoreState {
    /** 16 channels × 128 controllers, values[channelIndex][controllerNumber] */
    values: number[][];

    /** Updates a single CC value. Channel is 1-indexed (1–16). */
    updateCC(channel: number, controller: number, value: number): void;

    /** Replaces all 128 values for a channel atomically. Channel is 1-indexed. */
    updateChannel(channel: number, values: number[]): void;

    /** Replaces all 16 channels. Null entries are skipped (keep existing). */
    updateAllChannels(allValues: (number[] | null)[]): void;

    /** Resets all values to 0. */
    resetAll(): void;

    /** Gets a single CC value. Channel is 1-indexed. */
    getCC(channel: number, controller: number): number;

    /** Gets all 128 values for a channel. Channel is 1-indexed. */
    getChannel(channel: number): number[];
}

export const useCCStore = create<CCStoreState>((set, get) => ({
    values: createInitialValues(),

    updateCC(channel: number, controller: number, value: number): void {
        set((state) => {
            const channelIndex = channel - 1;
            const newChannelValues = [...state.values[channelIndex]];
            newChannelValues[controller] = value;

            const newValues = [...state.values];
            newValues[channelIndex] = newChannelValues;

            return { values: newValues };
        });
    },

    updateChannel(channel: number, values: number[]): void {
        set((state) => {
            const channelIndex = channel - 1;
            const newValues = [...state.values];
            newValues[channelIndex] = [...values];
            return { values: newValues };
        });
    },

    updateAllChannels(allValues: (number[] | null)[]): void {
        set((state) => {
            const newValues = [...state.values];
            for (let i = 0; i < allValues.length; i++) {
                if (allValues[i] !== null) {
                    newValues[i] = [...allValues[i]!];
                }
            }
            return { values: newValues };
        });
    },

    resetAll(): void {
        set({ values: createInitialValues() });
    },

    getCC(channel: number, controller: number): number {
        return get().values[channel - 1][controller];
    },

    getChannel(channel: number): number[] {
        return get().values[channel - 1];
    },
}));
