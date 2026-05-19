/**
 * ScanButton Component
 *
 * Action button for BLE scan/connect/disconnect operations.
 * Shows contextual text and styling based on the current connection state.
 *
 * - "Conectar" when disconnected or bluetooth unavailable
 * - "Escaneando..." when scanning
 * - "Conectando..." when connecting
 * - "Sincronizando..." when syncing
 * - "Desconectar" when connected
 * - "Reconectando..." when reconnecting
 *
 * Requirements: 1.2, 1.4, 2.1
 */

import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
} from 'react-native';

import { ConnectionState } from '../stores/connection-store';

export interface ScanButtonProps {
    connectionState: ConnectionState;
    onScanAndConnect: () => void;
    onDisconnect: () => void;
}

function getButtonText(state: ConnectionState): string {
    switch (state) {
        case 'disconnected':
        case 'bluetooth_unavailable':
            return 'Conectar';
        case 'scanning':
            return 'Escaneando...';
        case 'connecting':
            return 'Conectando...';
        case 'syncing':
            return 'Sincronizando...';
        case 'connected':
            return 'Desconectar';
        case 'reconnecting':
            return 'Reconectando...';
    }
}

function isDisabled(state: ConnectionState): boolean {
    return (
        state === 'scanning' ||
        state === 'connecting' ||
        state === 'syncing' ||
        state === 'reconnecting'
    );
}

export function ScanButton({
    connectionState,
    onScanAndConnect,
    onDisconnect,
}: ScanButtonProps) {
    const disabled = isDisabled(connectionState);
    const text = getButtonText(connectionState);
    const isConnected = connectionState === 'connected';
    const showSpinner = disabled;

    const handlePress = () => {
        if (disabled) return;

        if (isConnected) {
            onDisconnect();
        } else {
            onScanAndConnect();
        }
    };

    const backgroundColor = disabled
        ? '#9E9E9E'
        : isConnected
            ? '#E53935'
            : '#1E88E5';

    return (
        <Pressable
            style={[styles.button, { backgroundColor }]}
            onPress={handlePress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={text}
            accessibilityState={{ disabled }}
            testID="scan-button"
        >
            {showSpinner && (
                <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                    style={styles.spinner}
                    testID="scan-button-spinner"
                />
            )}
            <Text style={styles.text}>{text}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        width: '100%',
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    text: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    spinner: {
        marginRight: 8,
    },
});
