import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useConnectionStore, type ConnectionState } from '../stores/connection-store';

interface StateConfig {
    label: string;
    color: string;
}

const STATE_CONFIG: Record<ConnectionState, StateConfig> = {
    disconnected: { label: 'Desconectado', color: '#9E9E9E' },
    scanning: { label: 'Escaneando...', color: '#2196F3' },
    connecting: { label: 'Conectando...', color: '#FFC107' },
    syncing: { label: 'Sincronizando...', color: '#FFC107' },
    connected: { label: 'Conectado', color: '#4CAF50' },
    reconnecting: { label: 'Reconectando...', color: '#FF9800' },
    bluetooth_unavailable: { label: 'Bluetooth Indisponível', color: '#F44336' },
};

export function ConnectionStatus() {
    const connectionState = useConnectionStore((s) => s.state);
    const reconnectAttempt = useConnectionStore((s) => s.reconnectAttempt);

    const config = STATE_CONFIG[connectionState];

    const label =
        connectionState === 'reconnecting' && reconnectAttempt > 0
            ? `${config.label} (${reconnectAttempt}/5)`
            : config.label;

    return (
        <View style={[styles.badge, { backgroundColor: config.color }]}>
            <Text style={styles.text}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        alignSelf: 'center',
    },
    text: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '600',
    },
});
