import { ConnectionState, useConnectionStore } from '../connection-store';

describe('Connection Store', () => {
    beforeEach(() => {
        useConnectionStore.getState().reset();
    });

    it('should have correct initial state', () => {
        const state = useConnectionStore.getState();
        expect(state.state).toBe('disconnected');
        expect(state.reconnectAttempt).toBe(0);
        expect(state.syncProgress).toBe(0);
        expect(state.error).toBeNull();
    });

    describe('setState', () => {
        const allStates: ConnectionState[] = [
            'disconnected',
            'scanning',
            'connecting',
            'syncing',
            'connected',
            'reconnecting',
            'bluetooth_unavailable',
        ];

        it.each(allStates)('should transition to "%s"', (newState) => {
            useConnectionStore.getState().setState(newState);
            expect(useConnectionStore.getState().state).toBe(newState);
        });
    });

    describe('setReconnectAttempt', () => {
        it('should update reconnect attempt number', () => {
            useConnectionStore.getState().setReconnectAttempt(3);
            expect(useConnectionStore.getState().reconnectAttempt).toBe(3);
        });

        it('should handle attempt 0 (reset)', () => {
            useConnectionStore.getState().setReconnectAttempt(5);
            useConnectionStore.getState().setReconnectAttempt(0);
            expect(useConnectionStore.getState().reconnectAttempt).toBe(0);
        });
    });

    describe('setSyncProgress', () => {
        it('should update sync progress to channel number', () => {
            useConnectionStore.getState().setSyncProgress(8);
            expect(useConnectionStore.getState().syncProgress).toBe(8);
        });

        it('should handle progress 0 (idle)', () => {
            useConnectionStore.getState().setSyncProgress(16);
            useConnectionStore.getState().setSyncProgress(0);
            expect(useConnectionStore.getState().syncProgress).toBe(0);
        });
    });

    describe('setError', () => {
        it('should set error message', () => {
            useConnectionStore.getState().setError('Connection timeout');
            expect(useConnectionStore.getState().error).toBe('Connection timeout');
        });

        it('should clear error with null', () => {
            useConnectionStore.getState().setError('Some error');
            useConnectionStore.getState().setError(null);
            expect(useConnectionStore.getState().error).toBeNull();
        });
    });

    describe('reset', () => {
        it('should reset all fields to initial values', () => {
            const store = useConnectionStore.getState();
            store.setState('reconnecting');
            store.setReconnectAttempt(4);
            store.setSyncProgress(12);
            store.setError('Falha na reconexão');

            useConnectionStore.getState().reset();

            const resetState = useConnectionStore.getState();
            expect(resetState.state).toBe('disconnected');
            expect(resetState.reconnectAttempt).toBe(0);
            expect(resetState.syncProgress).toBe(0);
            expect(resetState.error).toBeNull();
        });
    });
});
