/**
 * Debug Screen
 *
 * Shows a real-time log of BLE packets sent and received.
 * Useful for development and troubleshooting communication issues.
 *
 * Features:
 * - Live packet log with direction (TX/RX), timestamp, and hex data
 * - Ping test button to verify connection is alive
 * - Clear log button
 * - Connection info display
 */

import React, { useCallback } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConnectionStore } from '../../src/stores/connection-store';
import {
  PacketLogEntry,
  usePacketLogStore,
} from '../../src/stores/packet-log-store';

export default function DebugScreen() {
  const connectionState = useConnectionStore((s) => s.state);
  const reconnectAttempt = useConnectionStore((s) => s.reconnectAttempt);
  const error = useConnectionStore((s) => s.error);

  const entries = usePacketLogStore((s) => s.entries);
  const clearLog = usePacketLogStore((s) => s.clear);

  const renderEntry = useCallback(({ item }: { item: PacketLogEntry }) => {
    const time = item.timestamp.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });

    return (
      <View style={styles.logEntry}>
        <Text style={styles.logTime}>{time}</Text>
        <Text
          style={[
            styles.logDirection,
            item.direction === 'TX' ? styles.logTx : styles.logRx,
          ]}
        >
          {item.direction}
        </Text>
        <Text style={styles.logContent}>
          Ch{item.channel} CC#{item.controller} = {item.value}{' '}
          <Text style={styles.logHex}>{item.hex}</Text>
        </Text>
      </View>
    );
  }, []);

  const keyExtractor = useCallback(
    (item: PacketLogEntry) => String(item.id),
    [],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Debug BLE</Text>
        <TouchableOpacity onPress={clearLog} style={styles.clearButton}>
          <Text style={styles.clearText}>Limpar</Text>
        </TouchableOpacity>
      </View>

      {/* Connection Info */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Estado:</Text>
          <Text style={styles.infoValue}>{connectionState}</Text>
        </View>
        {reconnectAttempt > 0 && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Reconexão:</Text>
            <Text style={styles.infoValue}>
              Tentativa {reconnectAttempt}/5
            </Text>
          </View>
        )}
        {error && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Erro:</Text>
            <Text style={[styles.infoValue, styles.errorText]}>
              {error}
            </Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Pacotes:</Text>
          <Text style={styles.infoValue}>{entries.length}</Text>
        </View>
      </View>

      {/* Packet Log */}
      <View style={styles.logContainer}>
        <Text style={styles.logHeader}>
          Log de Pacotes (últimos {entries.length})
        </Text>
        <FlatList
          data={entries}
          keyExtractor={keyExtractor}
          renderItem={renderEntry}
          style={styles.logList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Nenhum pacote registrado.{'\n'}
              Conecte ao controlador e interaja com os sliders.
            </Text>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e0e0e0',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
    borderRadius: 6,
  },
  clearText: {
    color: '#F44336',
    fontWeight: '600',
    fontSize: 13,
  },
  infoCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#16213e',
    borderRadius: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  infoLabel: {
    color: '#888',
    fontSize: 13,
  },
  infoValue: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '500',
  },
  errorText: {
    color: '#F44336',
  },
  logContainer: {
    flex: 1,
    marginHorizontal: 16,
  },
  logHeader: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  logList: {
    flex: 1,
  },
  logEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2a4a',
  },
  logTime: {
    fontSize: 10,
    color: '#666',
    width: 85,
    fontFamily: 'monospace',
  },
  logDirection: {
    fontSize: 11,
    fontWeight: '700',
    width: 26,
    textAlign: 'center',
  },
  logTx: {
    color: '#2196F3',
  },
  logRx: {
    color: '#4CAF50',
  },
  logContent: {
    fontSize: 12,
    color: '#e0e0e0',
    flex: 1,
    fontFamily: 'monospace',
  },
  logHex: {
    color: '#666',
    fontSize: 10,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 22,
  },
});
