/**
 * Packet Log Store
 *
 * Zustand store that records BLE packets sent and received for debugging.
 * Keeps the last 200 entries with timestamps and direction.
 */

import { create } from 'zustand';

import { CCMessage } from '../ble/protocol';

export type PacketDirection = 'TX' | 'RX';

export interface PacketLogEntry {
    id: number;
    timestamp: Date;
    direction: PacketDirection;
    channel: number;
    controller: number;
    value: number;
    /** Raw hex representation */
    hex: string;
}

interface PacketLogState {
    entries: PacketLogEntry[];
    nextId: number;

    /** Add a packet to the log */
    addEntry(direction: PacketDirection, msg: CCMessage): void;
    /** Clear all entries */
    clear(): void;
}

const MAX_ENTRIES = 200;

function formatHex(msg: CCMessage): string {
    const ch = msg.channel.toString(16).padStart(2, '0');
    const cc = msg.controller.toString(16).padStart(2, '0');
    const val = msg.value.toString(16).padStart(2, '0');
    return `[${ch} ${cc} ${val}]`;
}

export const usePacketLogStore = create<PacketLogState>((set, get) => ({
    entries: [],
    nextId: 1,

    addEntry(direction: PacketDirection, msg: CCMessage) {
        const state = get();
        const entry: PacketLogEntry = {
            id: state.nextId,
            timestamp: new Date(),
            direction,
            channel: msg.channel,
            controller: msg.controller,
            value: msg.value,
            hex: formatHex(msg),
        };

        set({
            entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
            nextId: state.nextId + 1,
        });
    },

    clear() {
        set({ entries: [], nextId: 1 });
    },
}));
