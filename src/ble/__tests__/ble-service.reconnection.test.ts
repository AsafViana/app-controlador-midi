/**
 * Unit tests for BLE Service reconnection logic.
 *
 * Tests the handleReconnection() method behavior:
 * - Initial delay before first attempt
 * - Retry up to 5 times with 2s interval
 * - Successful reconnect: rediscover services, re-enable notifications, re-sync
 * - Max retries exceeded: transition to 'disconnected' with error
 * - Skip reconnection on user-initiated disconnect
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import { Device, Subscription } from 'react-native-ble-plx';

import { ConnectionState } from '../../stores/connection-store';
import { BLEService } from '../ble-service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-native-ble-plx', () => {
    const mockSubscription: Subscription = {
        remove: jest.fn(),
    };

    return {
        BleManager: jest.fn().mockImplementation(() => ({
            startDeviceScan: jest.fn(),
            stopDeviceScan: jest.fn(),
            destroy: jest.fn(),
        })),
        Device: jest.fn(),
        Subscription: jest.fn(),
        __mockSubscription: mockSubscription,
    };
});

// Helper to create a mock device
function createMockDevice(overrides: Partial<Record<string, unknown>> = {}): Device {
    const mockSubscription = { remove: jest.fn() };

    return {
        id: 'test-device-id',
        name: 'Controlador MIDI BLE',
        connect: jest.fn().mockResolvedValue(undefined),
        requestMTU: jest.fn().mockResolvedValue(undefined),
        discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue(undefined),
        characteristicsForService: jest.fn().mockResolvedValue([
            { uuid: '0000ff01-0000-1000-8000-00805f9b34fb' },
            { uuid: '0000ff02-0000-1000-8000-00805f9b34fb' },
        ]),
        cancelConnection: jest.fn().mockResolvedValue(undefined),
        onDisconnected: jest.fn().mockReturnValue(mockSubscription),
        monitorCharacteristicForService: jest.fn().mockReturnValue(mockSubscription),
        writeCharacteristicWithResponseForService: jest.fn().mockResolvedValue({}),
        readCharacteristicForService: jest.fn().mockResolvedValue({ value: null }),
        ...overrides,
    } as unknown as Device;
}

// Helper to create a device that returns itself from connect (simulates react-native-ble-plx)
function createSelfConnectingDevice(overrides: Partial<Record<string, unknown>> = {}): Device {
    const mockSubscription = { remove: jest.fn() };
    const device: Record<string, unknown> = {
        id: 'test-device-id',
        name: 'Controlador MIDI BLE',
        requestMTU: jest.fn().mockResolvedValue(undefined),
        discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue(undefined),
        characteristicsForService: jest.fn().mockResolvedValue([
            { uuid: '0000ff01-0000-1000-8000-00805f9b34fb' },
            { uuid: '0000ff02-0000-1000-8000-00805f9b34fb' },
        ]),
        cancelConnection: jest.fn().mockResolvedValue(undefined),
        onDisconnected: jest.fn().mockReturnValue(mockSubscription),
        monitorCharacteristicForService: jest.fn().mockReturnValue(mockSubscription),
        writeCharacteristicWithResponseForService: jest.fn().mockResolvedValue({}),
        readCharacteristicForService: jest.fn().mockResolvedValue({ value: null }),
        ...overrides,
    };
    // connect() returns the device itself (simulating the connected device)
    device.connect = jest.fn().mockResolvedValue(device);
    return device as unknown as Device;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BLEService - Reconnection Logic', () => {
    let service: BLEService;

    beforeEach(() => {
        jest.useFakeTimers();
        service = new BLEService({
            reconnectMaxAttempts: 5,
            reconnectInterval: 2000,
            reconnectInitialDelay: 1000,
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        service.destroy();
    });

    describe('handleReconnection triggered by unexpected disconnect', () => {
        it('should emit reconnecting state on unexpected disconnect', async () => {
            const stateChanges: ConnectionState[] = [];
            service.onConnectionStateChange = (state) => stateChanges.push(state);

            const device = createSelfConnectingDevice();
            await service.connect(device);

            // Simulate unexpected disconnect
            const onDisconnectedCallback = (device.onDisconnected as jest.Mock).mock.calls[0][0];
            onDisconnectedCallback(null, device);

            expect(stateChanges).toContain('reconnecting');
        });

        it('should NOT trigger reconnection on user-initiated disconnect', async () => {
            const stateChanges: ConnectionState[] = [];
            service.onConnectionStateChange = (state) => stateChanges.push(state);

            const device = createSelfConnectingDevice();
            await service.connect(device);

            // User disconnects
            await service.disconnect();

            // The state should be 'disconnected', not 'reconnecting'
            expect(stateChanges[stateChanges.length - 1]).toBe('disconnected');
            expect(service.getIsReconnecting()).toBe(false);
        });

        it('should wait initial delay (1s) before first reconnection attempt', async () => {
            const attempts: number[] = [];
            service.onReconnectAttempt = (attempt) => attempts.push(attempt);

            const device = createSelfConnectingDevice({
                connect: jest.fn().mockRejectedValue(new Error('Connection failed')),
            });
            // Need to make the initial connect succeed
            (device.connect as jest.Mock).mockResolvedValueOnce(device);
            await service.connect(device);

            // Now make connect fail for reconnection attempts
            (device.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

            // Trigger unexpected disconnect
            const onDisconnectedCallback = (device.onDisconnected as jest.Mock).mock.calls[0][0];
            onDisconnectedCallback(null, device);

            // No attempts yet (initial delay hasn't passed)
            expect(attempts).toHaveLength(0);

            // Advance past initial delay
            await jest.advanceTimersByTimeAsync(1000);

            // First attempt should have been made
            expect(attempts.length).toBeGreaterThanOrEqual(1);
            expect(attempts[0]).toBe(1);
        });

        it('should retry up to 5 times with 2s interval between attempts', async () => {
            const attempts: number[] = [];
            service.onReconnectAttempt = (attempt) => attempts.push(attempt);

            const device = createSelfConnectingDevice();
            // First connect succeeds
            (device.connect as jest.Mock).mockResolvedValueOnce(device);
            await service.connect(device);

            // All reconnection attempts fail
            (device.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

            // Trigger unexpected disconnect
            const onDisconnectedCallback = (device.onDisconnected as jest.Mock).mock.calls[0][0];
            onDisconnectedCallback(null, device);

            // Advance through initial delay + all attempts with intervals
            // 1s initial + (5 attempts with 2s intervals between first 4)
            await jest.advanceTimersByTimeAsync(1000 + 5 * 2000 + 1000);

            expect(attempts).toEqual([1, 2, 3, 4, 5]);
        });

        it('should transition to disconnected after max retries exceeded', async () => {
            const stateChanges: ConnectionState[] = [];
            service.onConnectionStateChange = (state) => stateChanges.push(state);

            const device = createSelfConnectingDevice();
            (device.connect as jest.Mock).mockResolvedValueOnce(device);
            await service.connect(device);

            // All reconnection attempts fail
            (device.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

            // Trigger unexpected disconnect
            const onDisconnectedCallback = (device.onDisconnected as jest.Mock).mock.calls[0][0];
            onDisconnectedCallback(null, device);

            // Advance through all attempts
            await jest.advanceTimersByTimeAsync(1000 + 5 * 2000 + 1000);

            // Last state should be 'disconnected'
            expect(stateChanges[stateChanges.length - 1]).toBe('disconnected');
            expect(service.getIsReconnecting()).toBe(false);
        });

        it('should reconnect successfully and emit connected state', async () => {
            const stateChanges: ConnectionState[] = [];
            service.onConnectionStateChange = (state) => stateChanges.push(state);

            const device = createSelfConnectingDevice();
            await service.connect(device);

            // Trigger unexpected disconnect
            const onDisconnectedCallback = (device.onDisconnected as jest.Mock).mock.calls[0][0];
            onDisconnectedCallback(null, device);

            // Advance past initial delay — reconnection should succeed on first attempt
            await jest.advanceTimersByTimeAsync(1000);

            // Should have reconnected: 'connected' → 'reconnecting' → 'connected' → 'connected'
            // The last 'connected' is from handleReconnection success
            expect(stateChanges.filter((s) => s === 'connected').length).toBeGreaterThanOrEqual(2);
            expect(service.getIsReconnecting()).toBe(false);
        });

        it('should re-enable notifications after successful reconnect', async () => {
            const device = createSelfConnectingDevice();
            await service.connect(device);

            const monitorCalls = (device.monitorCharacteristicForService as jest.Mock).mock.calls.length;

            // Trigger unexpected disconnect
            const onDisconnectedCallback = (device.onDisconnected as jest.Mock).mock.calls[0][0];
            onDisconnectedCallback(null, device);

            // Advance past initial delay
            await jest.advanceTimersByTimeAsync(1000);

            // monitorCharacteristicForService should have been called again (re-enable notifications)
            expect((device.monitorCharacteristicForService as jest.Mock).mock.calls.length)
                .toBeGreaterThan(monitorCalls);
        });

        it('should stop reconnection if user disconnects during attempts', async () => {
            const attempts: number[] = [];
            service.onReconnectAttempt = (attempt) => attempts.push(attempt);

            const device = createSelfConnectingDevice();
            (device.connect as jest.Mock).mockResolvedValueOnce(device);
            await service.connect(device);

            // Make reconnection attempts fail
            (device.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

            // Trigger unexpected disconnect
            const onDisconnectedCallback = (device.onDisconnected as jest.Mock).mock.calls[0][0];
            onDisconnectedCallback(null, device);

            // Advance past initial delay + first attempt
            await jest.advanceTimersByTimeAsync(1000);

            // User disconnects during reconnection
            await service.disconnect();

            // Advance more time — no more attempts should happen
            const attemptsBeforeDisconnect = attempts.length;
            await jest.advanceTimersByTimeAsync(10000);

            // Should not have made significantly more attempts after user disconnect
            // (at most one more that was already in-flight)
            expect(attempts.length).toBeLessThanOrEqual(attemptsBeforeDisconnect + 1);
            expect(service.getIsReconnecting()).toBe(false);
        });
    });
});
