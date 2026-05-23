/**
 * useBLEController Hook
 *
 * Orchestrates BLE Service with CC Store and Connection Store.
 * Provides a clean interface for UI components to interact with the BLE MIDI Controller.
 *
 * Responsibilities:
 * - scanAndConnect: permissions → scan → connect → notifications → sync
 * - disconnect: user-initiated disconnect
 * - sendCC: optimistic update → write → rollback on failure
 * - syncChannel: bulk read → update CC Store
 * - Subscribe to BLE notifications → update CC Store
 * - Subscribe to connection state changes → update Connection Store
 *
 * Requirements: 1.5, 2.3, 3.1, 4.1, 4.2, 5.1, 5.2, 5.6, 6.1, 7.1, 8.4, 8.5
 */

import { useCallback, useEffect, useRef } from 'react';

import { BLEService } from '../ble/ble-service';
import { isValidCC } from '../ble/protocol';
import { requestBLEPermissions } from '../services/permission-service';
import { useCCStore } from '../stores/cc-store';
import { ConnectionState, useConnectionStore } from '../stores/connection-store';

// Module-level singleton — holds the instance reference but does NOT
// instantiate BLEService at module load time (BleManager native module
// is not ready yet at that point, causing 'createClient of null' crash).
let bleServiceInstance: BLEService | null = null;

function getBLEService(): BLEService {
    if (!bleServiceInstance) {
        // BLEService constructor no longer calls new BleManager() eagerly;
        // the manager is created on first actual BLE operation.
        bleServiceInstance = new BLEService();
    }
    return bleServiceInstance;
}

export function useBLEController() {
    // Initialise (or reuse) the singleton inside the hook body so it runs
    // after the React Native bridge and Native Modules are fully ready.
    const bleServiceRef = useRef<BLEService | null>(null);
    if (bleServiceRef.current === null) {
        bleServiceRef.current = getBLEService();
    }

    // Connection Store
    const connectionState = useConnectionStore((s) => s.state);
    const reconnectAttempt = useConnectionStore((s) => s.reconnectAttempt);
    const syncProgress = useConnectionStore((s) => s.syncProgress);
    const error = useConnectionStore((s) => s.error);
    const setConnectionState = useConnectionStore((s) => s.setState);
    const setReconnectAttempt = useConnectionStore((s) => s.setReconnectAttempt);
    const setSyncProgress = useConnectionStore((s) => s.setSyncProgress);
    const setError = useConnectionStore((s) => s.setError);

    // CC Store
    const updateCC = useCCStore((s) => s.updateCC);
    const updateAllChannels = useCCStore((s) => s.updateAllChannels);
    const updateChannel = useCCStore((s) => s.updateChannel);
    const getCC = useCCStore((s) => s.getCC);

    // Setup BLE service callbacks
    useEffect(() => {
        const bleService = bleServiceRef.current!;

        // Wire CC notifications → CC Store
        bleService.onCCNotification = (msg) => {
            updateCC(msg.channel, msg.controller, msg.value);
        };

        // Wire connection state changes → Connection Store
        bleService.onConnectionStateChange = (state: ConnectionState) => {
            setConnectionState(state);
            if (state === 'disconnected') {
                setReconnectAttempt(0);
                setSyncProgress(0);
            }
        };

        // Wire reconnect attempts → Connection Store
        bleService.onReconnectAttempt = (attempt: number) => {
            setReconnectAttempt(attempt);
        };

        return () => {
            bleService.onCCNotification = null;
            bleService.onConnectionStateChange = null;
            bleService.onReconnectAttempt = null;
        };
    }, [updateCC, setConnectionState, setReconnectAttempt, setSyncProgress]);

    /**
     * Full scan and connect flow:
     * 1. Request permissions
     * 2. Scan for device
     * 3. Connect
     * 4. Enable notifications
     * 5. Sync all channels
     */
    const scanAndConnect = useCallback(async (): Promise<void> => {
        const bleService = bleServiceRef.current!;

        try {
            // Step 1: Set state to scanning
            setConnectionState('scanning');
            setError(null);

            // Step 2: Request permissions
            const permissionResult = await requestBLEPermissions();

            if (!permissionResult.granted) {
                setError('Permissões BLE necessárias para conectar');
                setConnectionState('disconnected');
                return;
            }

            if (!permissionResult.bluetoothEnabled) {
                setConnectionState('bluetooth_unavailable');
                setError('Ative o Bluetooth para conectar');
                return;
            }

            // Step 3: Scan for device
            const device = await bleService.scan();

            if (!device) {
                setError('Nenhum dispositivo encontrado');
                setConnectionState('disconnected');
                return;
            }

            // Step 4: Connect
            setConnectionState('connecting');

            try {
                await bleService.connect(device);
            } catch (connectError) {
                const message =
                    connectError instanceof Error
                        ? connectError.message
                        : 'Falha na conexão';
                setError(message);
                setConnectionState('disconnected');
                return;
            }

            // Step 5: Syncing — enable notifications and sync all channels
            setConnectionState('syncing');

            await bleService.enableNotifications();

            const results = await bleService.syncAllChannels((channel) => {
                setSyncProgress(channel);
            });

            // Step 6: Update CC Store with sync results
            updateAllChannels(results);

            // Step 7: Connected
            setSyncProgress(0);
            setConnectionState('connected');
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Erro desconhecido';
            setError(message);
            setConnectionState('disconnected');
        }
    }, [setConnectionState, setError, setSyncProgress, updateAllChannels]);

    /**
     * User-initiated disconnect.
     * Marks as user-initiated to prevent auto-reconnection.
     */
    const disconnect = useCallback(async (): Promise<void> => {
        const bleService = bleServiceRef.current!;

        try {
            await bleService.disconnect();
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Erro ao desconectar';
            setError(message);
        }
    }, [setError]);

    /**
     * Send a CC value to the device with optimistic update and rollback on failure.
     * Validates the message before sending.
     */
    const sendCC = useCallback(
        async (channel: number, controller: number, value: number): Promise<void> => {
            const bleService = bleServiceRef.current!;
            const msg = { channel, controller, value };

            // Validate
            if (!isValidCC(msg)) {
                throw new Error(
                    `CC inválido: channel=${channel}, controller=${controller}, value=${value}`,
                );
            }

            // Get previous value for rollback
            const previousValue = getCC(channel, controller);

            // Optimistic update
            updateCC(channel, controller, value);

            try {
                await bleService.writeCC(msg);
            } catch (err) {
                // Rollback on failure
                updateCC(channel, controller, previousValue);
                const message =
                    err instanceof Error ? err.message : 'Falha ao enviar CC';
                setError(message);
                throw err;
            }
        },
        [getCC, updateCC, setError],
    );

    /**
     * Sync a single channel via bulk read and update CC Store.
     */
    const syncChannel = useCallback(
        async (channel: number): Promise<void> => {
            const bleService = bleServiceRef.current!;

            try {
                const values = await bleService.bulkRead(channel);
                updateChannel(channel, values);
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : `Falha ao sincronizar canal ${channel}`;
                setError(message);
                throw err;
            }
        },
        [updateChannel, setError],
    );

    return {
        // State
        connectionState,
        reconnectAttempt,
        syncProgress,
        error,

        // Actions
        scanAndConnect,
        disconnect,
        sendCC,
        syncChannel,
    };
}
