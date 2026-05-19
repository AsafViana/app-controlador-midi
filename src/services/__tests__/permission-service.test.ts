/**
 * Unit tests for Permission Service
 *
 * Tests permission grant/deny flows for Android and iOS platforms.
 * Mocks PermissionsAndroid and BleManager to verify all paths.
 *
 * Requirements: 1.5, 1.6, 12.1, 12.3, 12.4, 12.5
 */

import { PermissionsAndroid, Platform } from 'react-native';
import { State } from 'react-native-ble-plx';

// Mock react-native-ble-plx
const mockState = jest.fn();
jest.mock('react-native-ble-plx', () => ({
    BleManager: jest.fn().mockImplementation(() => ({
        state: mockState,
    })),
    State: {
        PoweredOn: 'PoweredOn',
        PoweredOff: 'PoweredOff',
        Unknown: 'Unknown',
        Resetting: 'Resetting',
        Unsupported: 'Unsupported',
        Unauthorized: 'Unauthorized',
    },
}));

describe('Permission Service', () => {
    beforeEach(() => {
        jest.resetModules();
        mockState.mockReset();
    });

    describe('checkBluetoothEnabled', () => {
        it('returns true when Bluetooth is PoweredOn', async () => {
            mockState.mockResolvedValue(State.PoweredOn);

            const { checkBluetoothEnabled } = require('../permission-service');
            const result = await checkBluetoothEnabled();

            expect(result).toBe(true);
        });

        it('returns false when Bluetooth is PoweredOff', async () => {
            mockState.mockResolvedValue(State.PoweredOff);

            const { checkBluetoothEnabled } = require('../permission-service');
            const result = await checkBluetoothEnabled();

            expect(result).toBe(false);
        });

        it('returns false when Bluetooth state is Unknown', async () => {
            mockState.mockResolvedValue(State.Unknown);

            const { checkBluetoothEnabled } = require('../permission-service');
            const result = await checkBluetoothEnabled();

            expect(result).toBe(false);
        });
    });

    describe('requestBLEPermissions - iOS', () => {
        beforeEach(() => {
            (Platform as any).OS = 'ios';
        });

        it('returns granted: true and bluetoothEnabled: true when BT is on', async () => {
            mockState.mockResolvedValue(State.PoweredOn);

            const { requestBLEPermissions } = require('../permission-service');
            const result = await requestBLEPermissions();

            expect(result).toEqual({
                granted: true,
                bluetoothEnabled: true,
            });
        });

        it('returns granted: true and bluetoothEnabled: false when BT is off', async () => {
            mockState.mockResolvedValue(State.PoweredOff);

            const { requestBLEPermissions } = require('../permission-service');
            const result = await requestBLEPermissions();

            expect(result).toEqual({
                granted: true,
                bluetoothEnabled: false,
            });
        });
    });

    describe('requestBLEPermissions - Android', () => {
        const mockRequestMultiple = jest.fn();

        beforeEach(() => {
            (Platform as any).OS = 'android';
            PermissionsAndroid.requestMultiple = mockRequestMultiple;
            mockRequestMultiple.mockReset();
        });

        it('returns granted: true when all permissions are granted', async () => {
            mockRequestMultiple.mockResolvedValue({
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]:
                    PermissionsAndroid.RESULTS.GRANTED,
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]:
                    PermissionsAndroid.RESULTS.GRANTED,
                [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
                    PermissionsAndroid.RESULTS.GRANTED,
            });
            mockState.mockResolvedValue(State.PoweredOn);

            const { requestBLEPermissions } = require('../permission-service');
            const result = await requestBLEPermissions();

            expect(result).toEqual({
                granted: true,
                bluetoothEnabled: true,
            });
            expect(mockRequestMultiple).toHaveBeenCalledWith([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ]);
        });

        it('returns granted: false when BLUETOOTH_SCAN is denied', async () => {
            mockRequestMultiple.mockResolvedValue({
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]:
                    PermissionsAndroid.RESULTS.DENIED,
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]:
                    PermissionsAndroid.RESULTS.GRANTED,
                [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
                    PermissionsAndroid.RESULTS.GRANTED,
            });
            mockState.mockResolvedValue(State.PoweredOn);

            const { requestBLEPermissions } = require('../permission-service');
            const result = await requestBLEPermissions();

            expect(result).toEqual({
                granted: false,
                bluetoothEnabled: true,
            });
        });

        it('returns granted: false when BLUETOOTH_CONNECT is denied', async () => {
            mockRequestMultiple.mockResolvedValue({
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]:
                    PermissionsAndroid.RESULTS.GRANTED,
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]:
                    PermissionsAndroid.RESULTS.DENIED,
                [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
                    PermissionsAndroid.RESULTS.GRANTED,
            });
            mockState.mockResolvedValue(State.PoweredOff);

            const { requestBLEPermissions } = require('../permission-service');
            const result = await requestBLEPermissions();

            expect(result).toEqual({
                granted: false,
                bluetoothEnabled: false,
            });
        });

        it('returns granted: false when ACCESS_FINE_LOCATION is denied', async () => {
            mockRequestMultiple.mockResolvedValue({
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]:
                    PermissionsAndroid.RESULTS.GRANTED,
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]:
                    PermissionsAndroid.RESULTS.GRANTED,
                [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
                    PermissionsAndroid.RESULTS.DENIED,
            });
            mockState.mockResolvedValue(State.PoweredOn);

            const { requestBLEPermissions } = require('../permission-service');
            const result = await requestBLEPermissions();

            expect(result).toEqual({
                granted: false,
                bluetoothEnabled: true,
            });
        });

        it('returns granted: false when all permissions are denied', async () => {
            mockRequestMultiple.mockResolvedValue({
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]:
                    PermissionsAndroid.RESULTS.DENIED,
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]:
                    PermissionsAndroid.RESULTS.DENIED,
                [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
                    PermissionsAndroid.RESULTS.DENIED,
            });
            mockState.mockResolvedValue(State.PoweredOff);

            const { requestBLEPermissions } = require('../permission-service');
            const result = await requestBLEPermissions();

            expect(result).toEqual({
                granted: false,
                bluetoothEnabled: false,
            });
        });

        it('returns granted: false when permissions are never_ask_again', async () => {
            mockRequestMultiple.mockResolvedValue({
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]:
                    PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
                [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]:
                    PermissionsAndroid.RESULTS.GRANTED,
                [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
                    PermissionsAndroid.RESULTS.GRANTED,
            });
            mockState.mockResolvedValue(State.PoweredOn);

            const { requestBLEPermissions } = require('../permission-service');
            const result = await requestBLEPermissions();

            expect(result).toEqual({
                granted: false,
                bluetoothEnabled: true,
            });
        });
    });
});
