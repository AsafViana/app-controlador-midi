import { create } from 'zustand';

export type ConnectionState =
    | 'disconnected'
    | 'scanning'
    | 'connecting'
    | 'syncing'
    | 'connected'
    | 'reconnecting'
    | 'bluetooth_unavailable';

export interface ConnectionStoreState {
    state: ConnectionState;
    reconnectAttempt: number;
    syncProgress: number; // 0–16 (channel being synced)
    error: string | null;

    // Actions
    setState(state: ConnectionState): void;
    setReconnectAttempt(attempt: number): void;
    setSyncProgress(channel: number): void;
    setError(error: string | null): void;
    reset(): void;
}

export const useConnectionStore = create<ConnectionStoreState>((set) => ({
    state: 'disconnected',
    reconnectAttempt: 0,
    syncProgress: 0,
    error: null,

    setState: (state: ConnectionState) => set({ state }),
    setReconnectAttempt: (attempt: number) => set({ reconnectAttempt: attempt }),
    setSyncProgress: (channel: number) => set({ syncProgress: channel }),
    setError: (error: string | null) => set({ error }),
    reset: () =>
        set({
            state: 'disconnected',
            reconnectAttempt: 0,
            syncProgress: 0,
            error: null,
        }),
}));
