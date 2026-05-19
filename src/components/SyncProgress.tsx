import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useConnectionStore } from '../stores/connection-store';

export function SyncProgress() {
    const state = useConnectionStore((s) => s.state);
    const syncProgress = useConnectionStore((s) => s.syncProgress);

    if (state !== 'syncing' || syncProgress <= 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            <ActivityIndicator size="small" color="#FFC107" />
            <Text style={styles.text}>
                Sincronizando canal {syncProgress} de 16
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255, 193, 7, 0.1)',
        borderRadius: 8,
        gap: 8,
    },
    text: {
        color: '#FFC107',
        fontSize: 13,
        fontWeight: '500',
    },
});
