/**
 * BLE Service
 *
 * Manages the BLE lifecycle: scan, connect, disconnect, read, write, notifications,
 * and automatic reconnection on unexpected disconnects.
 * Wraps react-native-ble-plx BleManager and exposes a clean interface for the app.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 5.1, 6.1, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import { BleManager, Device, Subscription } from 'react-native-ble-plx';

import { ConnectionState } from '../stores/connection-store';
import {
    BLE_DEVICE_NAME,
    BULK_CHAR_UUID,
    CC_CHAR_UUID,
    SERVICE_UUID,
    TOTAL_CHANNELS,
} from './constants';
import { CCMessage, decodeBulk, decodeCC, encodeBulkRequest, encodeCC } from './protocol';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface BLEServiceConfig {
    scanTimeout: number; // default: 10000ms
    connectionTimeout: number; // default: 10000ms
    requestMTU: number; // default: 185
    reconnectMaxAttempts: number; // default: 5
    reconnectInterval: number; // default: 2000ms
    reconnectInitialDelay: number; // default: 1000ms
    bulkReadTimeout: number; // default: 5000ms
    writeTimeout: number; // default: 5000ms
}

const DEFAULT_CONFIG: BLEServiceConfig = {
    scanTimeout: 10000,
    connectionTimeout: 10000,
    requestMTU: 185,
    reconnectMaxAttempts: 5,
    reconnectInterval: 2000,
    reconnectInitialDelay: 1000,
    bulkReadTimeout: 5000,
    writeTimeout: 5000,
};

// ─── BLE Service Class ────────────────────────────────────────────────────────

export class BLEService {
    // manager is lazily created on first use via ensureManager()
    // to avoid instantiating BleManager before the Native Module is ready.
    private _manager: BleManager | null = null;
    private config: BLEServiceConfig;
    private device: Device | null = null;
    private notificationSubscription: Subscription | null = null;
    private disconnectSubscription: Subscription | null = null;
    private isUserDisconnect = false;

    private isReconnecting = false;

    // Callbacks
    onCCNotification: ((msg: CCMessage) => void) | null = null;
    onConnectionStateChange: ((state: ConnectionState) => void) | null = null;
    onReconnectAttempt: ((attempt: number) => void) | null = null;

    constructor(config: Partial<BLEServiceConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        // NOTE: BleManager is NOT instantiated here — see ensureManager()
    }

    /**
     * Returns the BleManager instance, creating it on first call.
     * Deferred to avoid 'createClient of null' crash during module init.
     */
    private get manager(): BleManager {
        return this.ensureManager();
    }

    private ensureManager(): BleManager {
        if (!this._manager) {
            this._manager = new BleManager();
        }
        return this._manager;
    }

    // ─── Scan ─────────────────────────────────────────────────────────────────

    /**
     * Scans for the MIDI Controller device.
     * Filters by SERVICE_UUID and device name "Controlador MIDI BLE".
     * Returns the first matching device or null if timeout (10s) is reached.
     */
    async scan(): Promise<Device | null> {
        return new Promise<Device | null>((resolve) => {
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.manager.stopDeviceScan();
                    resolve(null);
                }
            }, this.config.scanTimeout);

            this.manager.startDeviceScan(
                [SERVICE_UUID],
                null,
                (error, device) => {
                    if (resolved) return;

                    if (error) {
                        resolved = true;
                        clearTimeout(timeout);
                        this.manager.stopDeviceScan();
                        resolve(null);
                        return;
                    }

                    if (device && device.name === BLE_DEVICE_NAME) {
                        resolved = true;
                        clearTimeout(timeout);
                        this.manager.stopDeviceScan();
                        resolve(device);
                    }
                },
            );
        });
    }

    // ─── Connect ──────────────────────────────────────────────────────────────

    /**
     * Connects to the given device, requests MTU 185, discovers services,
     * and validates that the CC characteristic (ff01) exists.
     * Throws if connection fails or device is incompatible.
     */
    async connect(device: Device): Promise<void> {
        this.isUserDisconnect = false;

        // Connect to device
        const connected = await device.connect({
            requestMTU: this.config.requestMTU,
        });

        // Request MTU explicitly (some platforms need this after connect)
        await connected.requestMTU(this.config.requestMTU);

        // Discover all services and characteristics
        await connected.discoverAllServicesAndCharacteristics();

        // Validate that the CC characteristic exists
        const characteristics = await connected.characteristicsForService(SERVICE_UUID);
        const hasCCChar = characteristics?.some(
            (c) => c.uuid === CC_CHAR_UUID,
        );

        if (!hasCCChar) {
            await connected.cancelConnection();
            throw new Error('Dispositivo não compatível: characteristic ff01 não encontrada');
        }

        this.device = connected;

        // Monitor disconnection events
        this.disconnectSubscription = this.device.onDisconnected((_error, disconnectedDevice) => {
            this.device = null;
            this.cleanupSubscriptions();

            if (!this.isUserDisconnect) {
                this.onConnectionStateChange?.('reconnecting');
                this.handleReconnection(disconnectedDevice ?? connected);
            } else {
                this.onConnectionStateChange?.('disconnected');
            }
        });

        this.onConnectionStateChange?.('connected');
    }

    // ─── Disconnect ───────────────────────────────────────────────────────────

    /**
     * Disconnects from the current device.
     * Marks the disconnection as user-initiated to prevent auto-reconnection.
     */
    async disconnect(): Promise<void> {
        this.isUserDisconnect = true;
        this.isReconnecting = false;

        if (this.device) {
            this.cleanupSubscriptions();
            await this.device.cancelConnection();
            this.device = null;
        }

        this.onConnectionStateChange?.('disconnected');
    }

    // ─── Notifications ────────────────────────────────────────────────────────

    /**
     * Enables notifications on the CC characteristic (ff01).
     * Incoming CC messages are decoded and forwarded to the onCCNotification callback.
     */
    async enableNotifications(): Promise<void> {
        if (!this.device) {
            throw new Error('Não conectado');
        }

        this.notificationSubscription = this.device.monitorCharacteristicForService(
            SERVICE_UUID,
            CC_CHAR_UUID,
            (error, characteristic) => {
                if (error) {
                    // Log internally but don't crash — maintain last known state
                    return;
                }

                if (characteristic?.value) {
                    const msg = decodeCC(characteristic.value);
                    if (msg) {
                        this.onCCNotification?.(msg);
                    }
                    // Invalid notifications are silently discarded (Req 4.4)
                }
            },
        );
    }

    // ─── Write CC ─────────────────────────────────────────────────────────────

    /**
     * Encodes and writes a CC message to the device via the CC characteristic (ff01).
     * Uses writeWithResponse for delivery confirmation.
     * Throws on timeout (5s) or BLE error.
     */
    async writeCC(msg: CCMessage): Promise<void> {
        if (!this.device) {
            throw new Error('Não conectado');
        }

        const base64 = encodeCC(msg);

        await this.withTimeout(
            this.device.writeCharacteristicWithResponseForService(
                SERVICE_UUID,
                CC_CHAR_UUID,
                base64,
            ),
            this.config.writeTimeout,
            'Timeout ao enviar CC',
        );
    }

    // ─── Bulk Read ────────────────────────────────────────────────────────────

    /**
     * Reads all 128 CC values for a given channel via the Bulk characteristic (ff02).
     * Protocol: write 1 byte (channel) → read 128-byte response.
     * Throws on timeout (5s), BLE error, or invalid response.
     */
    async bulkRead(channel: number): Promise<number[]> {
        if (!this.device) {
            throw new Error('Não conectado');
        }

        const request = encodeBulkRequest(channel);

        // Step 1: Write channel to BULK_CHAR_UUID
        await this.withTimeout(
            this.device.writeCharacteristicWithResponseForService(
                SERVICE_UUID,
                BULK_CHAR_UUID,
                request,
            ),
            this.config.bulkReadTimeout,
            `Timeout ao solicitar bulk read do canal ${channel}`,
        );

        // Step 2: Read 128-byte response from BULK_CHAR_UUID
        const characteristic = await this.withTimeout(
            this.device.readCharacteristicForService(SERVICE_UUID, BULK_CHAR_UUID),
            this.config.bulkReadTimeout,
            `Timeout ao ler bulk read do canal ${channel}`,
        );

        if (!characteristic.value) {
            throw new Error(`Bulk read retornou vazio para canal ${channel}`);
        }

        const values = decodeBulk(characteristic.value);

        if (!values) {
            throw new Error(`Bulk read retornou dados inválidos para canal ${channel}`);
        }

        return values;
    }

    // ─── Sync All Channels ────────────────────────────────────────────────────

    /**
     * Sequentially reads all 16 channels via bulkRead.
     * Returns an array of 16 elements: number[] for successful reads, null for failed ones.
     * Calls onProgress(channel) after each channel attempt.
     */
    async syncAllChannels(
        onProgress?: (channel: number) => void,
    ): Promise<(number[] | null)[]> {
        const results: (number[] | null)[] = [];

        for (let channel = 1; channel <= TOTAL_CHANNELS; channel++) {
            try {
                const values = await this.bulkRead(channel);
                results.push(values);
            } catch {
                // Failed channel — store null and continue (Req 3.4)
                results.push(null);
            }

            onProgress?.(channel);
        }

        return results;
    }

    // ─── Destroy ──────────────────────────────────────────────────────────────

    /**
     * Cleans up the BleManager instance and all subscriptions.
     * Call this when the service is no longer needed.
     */
    destroy(): void {
        this.cleanupSubscriptions();
        if (this._manager) {
            this._manager.destroy();
            this._manager = null;
        }
    }

    // ─── Getters ──────────────────────────────────────────────────────────────

    /**
     * Returns the currently connected device, or null if not connected.
     */
    getDevice(): Device | null {
        return this.device;
    }

    /**
     * Returns whether the last disconnect was user-initiated.
     */
    getIsUserDisconnect(): boolean {
        return this.isUserDisconnect;
    }

    /**
     * Returns whether the service is currently attempting to reconnect.
     */
    getIsReconnecting(): boolean {
        return this.isReconnecting;
    }

    // ─── Reconnection ─────────────────────────────────────────────────────────

    /**
     * Handles automatic reconnection after an unexpected disconnection.
     * Waits an initial delay (1s), then retries up to 5 times with 2s intervals.
     * On success: rediscovers services, re-enables notifications, re-syncs all channels.
     * On failure after max retries: transitions to 'disconnected' with error message.
     * Skips reconnection if disconnect was user-initiated.
     *
     * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
     */
    private async handleReconnection(lastDevice: Device): Promise<void> {
        if (this.isUserDisconnect || this.isReconnecting) return;

        this.isReconnecting = true;

        try {
            // Wait initial delay before first attempt
            await this.delay(this.config.reconnectInitialDelay);

            for (let attempt = 1; attempt <= this.config.reconnectMaxAttempts; attempt++) {
                // Check if user disconnected during reconnection
                if (this.isUserDisconnect) {
                    this.isReconnecting = false;
                    return;
                }

                this.onReconnectAttempt?.(attempt);

                try {
                    // Attempt to reconnect to the last known device
                    await this.connect(lastDevice);

                    // Re-enable notifications
                    await this.enableNotifications();

                    // Re-sync all channels
                    await this.syncAllChannels();

                    // Success — transition to connected state
                    this.onConnectionStateChange?.('connected');
                    this.isReconnecting = false;
                    return;
                } catch {
                    // Attempt failed — wait before next retry (unless it's the last attempt)
                    if (attempt < this.config.reconnectMaxAttempts) {
                        await this.delay(this.config.reconnectInterval);
                    }
                }
            }

            // All attempts exhausted
            this.onConnectionStateChange?.('disconnected');
            this.isReconnecting = false;
        } catch {
            // Unexpected error during reconnection flow
            this.onConnectionStateChange?.('disconnected');
            this.isReconnecting = false;
        }
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────

    private cleanupSubscriptions(): void {
        if (this.notificationSubscription) {
            this.notificationSubscription.remove();
            this.notificationSubscription = null;
        }
        if (this.disconnectSubscription) {
            this.disconnectSubscription.remove();
            this.disconnectSubscription = null;
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private withTimeout<T>(
        promise: Promise<T>,
        ms: number,
        errorMessage: string,
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(errorMessage));
            }, ms);

            promise
                .then((result) => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch((error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }
}
