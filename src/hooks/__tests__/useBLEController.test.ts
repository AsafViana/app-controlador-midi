/**
 * Unit tests for useBLEController hook.
 *
 * Validates: Requirements 4.2, 5.2, 5.6, 7.5
 */

import { act, renderHook } from '@testing-library/react-native';

import { useCCStore } from '../../stores/cc-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useBLEController } from '../useBLEController';

// ─── Mock BLE Service ─────────────────────────────────────────────────────────

const mockScan = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockEnableNotifications = jest.fn();
const mockWriteCC = jest.fn();
const mockBulkRead = jest.fn();
const mockSyncAllChannels = jest.fn();
const mockDestroy = jest.fn();

let mockCapturedOnCCNotification: ((msg: any) => void) | null = null;
let mockCapturedOnConnectionStateChange: ((state: any) => void) | null = null;
let mockCapturedOnReconnectAttempt: ((attempt: number) => void) | null = null;

jest.mock('../../ble/ble-service', () => {
    return {
        BLEService: jest.fn().mockImplementation(() => ({
            scan: mockScan,
            connect: mockConnect,
            disconnect: mockDisconnect,
            enableNotifications: mockEnableNotifications,
            writeCC: mockWriteCC,
            bulkRead: mockBulkRead,
            syncAllChannels: mockSyncAllChannels,
            destroy: mockDestroy,
            get onCCNotification() {
                return mockCapturedOnCCNotification;
            },
            set onCCNotification(cb: any) {
                mockCapturedOnCCNotification = cb;
            },
            get onConnectionStateChange() {
                return mockCapturedOnConnectionStateChange;
            },
            set onConnectionStateChange(cb: any) {
                mockCapturedOnConnectionStateChange = cb;
            },
            get onReconnectAttempt() {
                return mockCapturedOnReconnectAttempt;
            },
            set onReconnectAttempt(cb: any) {
                mockCapturedOnReconnectAttempt = cb;
            },
        })),
    };
});

// ─── Mock Permission Service ──────────────────────────────────────────────────

const mockRequestBLEPermissions = jest.fn();

jest.mock('../../services/permission-service', () => ({
    requestBLEPermissions: (...args: any[]) => mockRequestBLEPermissions(...args),
}));

// ─── Mock Protocol ────────────────────────────────────────────────────────────

jest.mock('../../ble/protocol', () => ({
    ...jest.requireActual('../../ble/protocol'),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useBLEController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCapturedOnCCNotification = null;
        mockCapturedOnConnectionStateChange = null;
        mockCapturedOnReconnectAttempt = null;

        // Reset stores to initial state
        useCCStore.getState().resetAll();
        useConnectionStore.getState().reset();
    });

    // ─── scanAndConnect Tests ─────────────────────────────────────────────────

    describe('scanAndConnect()', () => {
        it('follows full flow: permissions → scan → connect → notify → sync (Req 4.2)', async () => {
            const mockDevice = { id: 'device-1', name: 'Controlador MIDI BLE' };
            const syncResults = [new Array(128).fill(64)];
            // Fill remaining 15 channels with null
            for (let i = 1; i < 16; i++) syncResults.push(null);

            mockRequestBLEPermissions.mockResolvedValue({ granted: true, bluetoothEnabled: true });
            mockScan.mockResolvedValue(mockDevice);
            mockConnect.mockResolvedValue(undefined);
            mockEnableNotifications.mockResolvedValue(undefined);
            mockSyncAllChannels.mockImplementation(async (onProgress: any) => {
                for (let i = 1; i <= 16; i++) onProgress(i);
                return syncResults;
            });

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.scanAndConnect();
            });

            // Verify the full flow was called in order
            expect(mockRequestBLEPermissions).toHaveBeenCalledTimes(1);
            expect(mockScan).toHaveBeenCalledTimes(1);
            expect(mockConnect).toHaveBeenCalledWith(mockDevice);
            expect(mockEnableNotifications).toHaveBeenCalledTimes(1);
            expect(mockSyncAllChannels).toHaveBeenCalledTimes(1);

            // Verify connection state ends as 'connected'
            expect(useConnectionStore.getState().state).toBe('connected');
        });

        it('sets state to scanning before requesting permissions', async () => {
            mockRequestBLEPermissions.mockImplementation(async () => {
                // At this point, state should be 'scanning'
                expect(useConnectionStore.getState().state).toBe('scanning');
                return { granted: true, bluetoothEnabled: true };
            });
            mockScan.mockResolvedValue({ id: 'dev-1', name: 'Controlador MIDI BLE' });
            mockConnect.mockResolvedValue(undefined);
            mockEnableNotifications.mockResolvedValue(undefined);
            mockSyncAllChannels.mockResolvedValue(Array(16).fill(null));

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.scanAndConnect();
            });
        });

        it('stops and sets error when permissions are denied', async () => {
            mockRequestBLEPermissions.mockResolvedValue({ granted: false, bluetoothEnabled: true });

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.scanAndConnect();
            });

            expect(mockScan).not.toHaveBeenCalled();
            expect(useConnectionStore.getState().state).toBe('disconnected');
            expect(useConnectionStore.getState().error).toBe('Permissões BLE necessárias para conectar');
        });

        it('sets bluetooth_unavailable when bluetooth is off', async () => {
            mockRequestBLEPermissions.mockResolvedValue({ granted: true, bluetoothEnabled: false });

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.scanAndConnect();
            });

            expect(mockScan).not.toHaveBeenCalled();
            expect(useConnectionStore.getState().state).toBe('bluetooth_unavailable');
            expect(useConnectionStore.getState().error).toBe('Ative o Bluetooth para conectar');
        });

        it('sets error when no device is found during scan', async () => {
            mockRequestBLEPermissions.mockResolvedValue({ granted: true, bluetoothEnabled: true });
            mockScan.mockResolvedValue(null);

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.scanAndConnect();
            });

            expect(useConnectionStore.getState().state).toBe('disconnected');
            expect(useConnectionStore.getState().error).toBe('Nenhum dispositivo encontrado');
        });

        it('sets error and disconnects when connection fails', async () => {
            mockRequestBLEPermissions.mockResolvedValue({ granted: true, bluetoothEnabled: true });
            mockScan.mockResolvedValue({ id: 'dev-1', name: 'Controlador MIDI BLE' });
            mockConnect.mockRejectedValue(new Error('Connection timeout'));

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.scanAndConnect();
            });

            expect(useConnectionStore.getState().state).toBe('disconnected');
            expect(useConnectionStore.getState().error).toBe('Connection timeout');
        });

        it('updates CC Store with sync results after successful connection', async () => {
            const channelValues = Array.from({ length: 128 }, (_, i) => i % 128);
            const syncResults: (number[] | null)[] = [channelValues];
            for (let i = 1; i < 16; i++) syncResults.push(null);

            mockRequestBLEPermissions.mockResolvedValue({ granted: true, bluetoothEnabled: true });
            mockScan.mockResolvedValue({ id: 'dev-1', name: 'Controlador MIDI BLE' });
            mockConnect.mockResolvedValue(undefined);
            mockEnableNotifications.mockResolvedValue(undefined);
            mockSyncAllChannels.mockImplementation(async (onProgress: any) => {
                for (let i = 1; i <= 16; i++) onProgress(i);
                return syncResults;
            });

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.scanAndConnect();
            });

            // Channel 1 should have the synced values
            expect(useCCStore.getState().values[0]).toEqual(channelValues);
            // Channel 2 should remain zeros (null in sync results)
            expect(useCCStore.getState().values[1]).toEqual(new Array(128).fill(0));
        });

        it('reports sync progress during sync phase', async () => {
            mockRequestBLEPermissions.mockResolvedValue({ granted: true, bluetoothEnabled: true });
            mockScan.mockResolvedValue({ id: 'dev-1', name: 'Controlador MIDI BLE' });
            mockConnect.mockResolvedValue(undefined);
            mockEnableNotifications.mockResolvedValue(undefined);

            const progressValues: number[] = [];
            mockSyncAllChannels.mockImplementation(async (onProgress: any) => {
                for (let i = 1; i <= 16; i++) {
                    onProgress(i);
                    progressValues.push(useConnectionStore.getState().syncProgress);
                }
                return Array(16).fill(null);
            });

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.scanAndConnect();
            });

            // Verify progress was reported for each channel
            expect(progressValues).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
            // After completion, syncProgress should be reset to 0
            expect(useConnectionStore.getState().syncProgress).toBe(0);
        });
    });

    // ─── sendCC Tests ─────────────────────────────────────────────────────────

    describe('sendCC()', () => {
        it('performs optimistic update before BLE write (Req 5.2)', async () => {
            let valueAtWriteTime: number | undefined;
            mockWriteCC.mockImplementation(async () => {
                // Capture the store value at the time of BLE write
                valueAtWriteTime = useCCStore.getState().values[0][74];
            });

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.sendCC(1, 74, 100);
            });

            // The store should have been updated BEFORE writeCC resolved
            expect(valueAtWriteTime).toBe(100);
            // Final state should also be 100
            expect(useCCStore.getState().values[0][74]).toBe(100);
        });

        it('rolls back optimistic update on write failure (Req 5.6)', async () => {
            // Set an initial value
            useCCStore.getState().updateCC(1, 74, 50);

            mockWriteCC.mockRejectedValue(new Error('BLE write failed'));

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                try {
                    await result.current.sendCC(1, 74, 100);
                } catch {
                    // Expected to throw
                }
            });

            // Value should be rolled back to 50
            expect(useCCStore.getState().values[0][74]).toBe(50);
            // Error should be set in connection store
            expect(useConnectionStore.getState().error).toBe('BLE write failed');
        });

        it('throws error on invalid CC message', async () => {
            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await expect(result.current.sendCC(0, 74, 100)).rejects.toThrow('CC inválido');
            });

            // writeCC should not have been called
            expect(mockWriteCC).not.toHaveBeenCalled();
        });

        it('throws error when channel is out of range', async () => {
            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await expect(result.current.sendCC(17, 0, 0)).rejects.toThrow('CC inválido');
            });
        });

        it('throws error when controller is out of range', async () => {
            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await expect(result.current.sendCC(1, 128, 0)).rejects.toThrow('CC inválido');
            });
        });

        it('throws error when value is out of range', async () => {
            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await expect(result.current.sendCC(1, 0, 128)).rejects.toThrow('CC inválido');
            });
        });

        it('keeps store value on successful write', async () => {
            mockWriteCC.mockResolvedValue(undefined);

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.sendCC(5, 10, 127);
            });

            expect(useCCStore.getState().values[4][10]).toBe(127);
        });
    });

    // ─── Notification Tests ───────────────────────────────────────────────────

    describe('BLE notifications → CC Store (Req 4.2)', () => {
        it('updates CC Store when notification is received', async () => {
            renderHook(() => useBLEController());

            // Simulate a BLE notification via the captured callback
            await act(async () => {
                mockCapturedOnCCNotification?.({ channel: 3, controller: 42, value: 99 });
            });

            expect(useCCStore.getState().values[2][42]).toBe(99);
        });

        it('handles multiple rapid notifications', async () => {
            renderHook(() => useBLEController());

            await act(async () => {
                mockCapturedOnCCNotification?.({ channel: 1, controller: 0, value: 10 });
                mockCapturedOnCCNotification?.({ channel: 1, controller: 0, value: 20 });
                mockCapturedOnCCNotification?.({ channel: 1, controller: 0, value: 30 });
            });

            // Should have the last value
            expect(useCCStore.getState().values[0][0]).toBe(30);
        });

        it('updates different channels independently', async () => {
            renderHook(() => useBLEController());

            await act(async () => {
                mockCapturedOnCCNotification?.({ channel: 1, controller: 5, value: 50 });
                mockCapturedOnCCNotification?.({ channel: 2, controller: 5, value: 75 });
            });

            expect(useCCStore.getState().values[0][5]).toBe(50);
            expect(useCCStore.getState().values[1][5]).toBe(75);
        });
    });

    // ─── Connection State Change Tests ────────────────────────────────────────

    describe('connection state changes → Connection Store', () => {
        it('updates Connection Store on state change callback', async () => {
            renderHook(() => useBLEController());

            await act(async () => {
                mockCapturedOnConnectionStateChange?.('reconnecting');
            });

            expect(useConnectionStore.getState().state).toBe('reconnecting');
        });

        it('resets reconnectAttempt and syncProgress on disconnect', async () => {
            // Set some values first
            useConnectionStore.getState().setReconnectAttempt(3);
            useConnectionStore.getState().setSyncProgress(5);

            renderHook(() => useBLEController());

            await act(async () => {
                mockCapturedOnConnectionStateChange?.('disconnected');
            });

            expect(useConnectionStore.getState().reconnectAttempt).toBe(0);
            expect(useConnectionStore.getState().syncProgress).toBe(0);
        });

        it('updates reconnect attempt via callback', async () => {
            renderHook(() => useBLEController());

            await act(async () => {
                mockCapturedOnReconnectAttempt?.(3);
            });

            expect(useConnectionStore.getState().reconnectAttempt).toBe(3);
        });
    });

    // ─── Disconnect Tests ─────────────────────────────────────────────────────

    describe('disconnect()', () => {
        it('calls BLE service disconnect marking as user-initiated (Req 7.5)', async () => {
            mockDisconnect.mockResolvedValue(undefined);

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.disconnect();
            });

            expect(mockDisconnect).toHaveBeenCalledTimes(1);
        });

        it('sets error in connection store if disconnect fails', async () => {
            mockDisconnect.mockRejectedValue(new Error('Disconnect failed'));

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.disconnect();
            });

            expect(useConnectionStore.getState().error).toBe('Disconnect failed');
        });
    });

    // ─── syncChannel Tests ────────────────────────────────────────────────────

    describe('syncChannel()', () => {
        it('reads bulk data and updates CC Store for the channel', async () => {
            const channelValues = Array.from({ length: 128 }, (_, i) => i);
            mockBulkRead.mockResolvedValue(channelValues);

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await result.current.syncChannel(2);
            });

            expect(mockBulkRead).toHaveBeenCalledWith(2);
            expect(useCCStore.getState().values[1]).toEqual(channelValues);
        });

        it('sets error and throws on bulk read failure', async () => {
            mockBulkRead.mockRejectedValue(new Error('Bulk read timeout'));

            const { result } = renderHook(() => useBLEController());

            await act(async () => {
                await expect(result.current.syncChannel(1)).rejects.toThrow('Bulk read timeout');
            });

            expect(useConnectionStore.getState().error).toBe('Bulk read timeout');
        });
    });

    // ─── Cleanup Tests ────────────────────────────────────────────────────────

    describe('cleanup', () => {
        it('clears callbacks on unmount', () => {
            const { unmount } = renderHook(() => useBLEController());

            unmount();

            expect(mockCapturedOnCCNotification).toBeNull();
            expect(mockCapturedOnConnectionStateChange).toBeNull();
            expect(mockCapturedOnReconnectAttempt).toBeNull();
        });
    });
});
