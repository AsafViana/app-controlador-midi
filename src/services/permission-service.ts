/**
 * Permission Service
 *
 * Handles platform-specific BLE permission requests for Android and iOS.
 * - Android: Requests BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION at runtime
 * - iOS: Permissions are handled via Info.plist (configured by react-native-ble-plx plugin),
 *   so we just check Bluetooth adapter state
 *
 * Requirements: 1.5, 1.6, 12.1, 12.3, 12.4, 12.5
 */

import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, State } from 'react-native-ble-plx';

export interface PermissionResult {
    granted: boolean;
    bluetoothEnabled: boolean;
}

// Lazy singleton BleManager for permission checks
let bleManagerInstance: BleManager | null = null;

function getBleManager(): BleManager {
    if (!bleManagerInstance) {
        bleManagerInstance = new BleManager();
    }
    return bleManagerInstance;
}

/**
 * Checks if the Bluetooth adapter is powered on.
 * Uses BleManager's state() method to determine adapter status.
 */
export async function checkBluetoothEnabled(): Promise<boolean> {
    const manager = getBleManager();
    const state = await manager.state();
    return state === State.PoweredOn;
}

/**
 * Requests BLE permissions based on the current platform.
 *
 * Android: Requests BLUETOOTH_SCAN, BLUETOOTH_CONNECT, and ACCESS_FINE_LOCATION
 * via PermissionsAndroid.requestMultiple().
 *
 * iOS: Permissions are declared in Info.plist via the react-native-ble-plx config plugin.
 * No runtime permission request is needed — just check Bluetooth state.
 *
 * Returns { granted: boolean, bluetoothEnabled: boolean }
 */
export async function requestBLEPermissions(): Promise<PermissionResult> {
    if (Platform.OS === 'android') {
        return requestAndroidPermissions();
    }

    // iOS: permissions handled via Info.plist, just check Bluetooth state
    const bluetoothEnabled = await checkBluetoothEnabled();
    return {
        granted: true,
        bluetoothEnabled,
    };
}

/**
 * Android-specific permission request flow.
 * Requests BLUETOOTH_SCAN, BLUETOOTH_CONNECT, and ACCESS_FINE_LOCATION.
 */
async function requestAndroidPermissions(): Promise<PermissionResult> {
    const permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];

    const results = await PermissionsAndroid.requestMultiple(permissions);

    const granted =
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
        PermissionsAndroid.RESULTS.GRANTED;

    const bluetoothEnabled = await checkBluetoothEnabled();

    return {
        granted,
        bluetoothEnabled,
    };
}
