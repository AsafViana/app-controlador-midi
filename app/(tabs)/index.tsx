/**
 * Main Controller Screen
 *
 * Composes all BLE MIDI Controller UI components into a cohesive interface:
 * - ConnectionStatus: fixed header badge showing BLE state
 * - ChannelSelector: horizontal row of 16 channel buttons
 * - CCGrid: scrollable list of 128 CC sliders for selected channel
 * - ScanButton: scan/connect/disconnect action button
 * - SyncProgress: progress indicator during bulk sync
 *
 * Wires useBLEController hook to all components:
 * - Channel selection updates CCGrid and triggers bulk read if channel not yet synced
 * - Slider interaction calls sendCC on sliding complete
 * - Error messages from Connection Store are displayed
 *
 * Requirements: 8.4, 8.5, 8.7, 9.1, 10.2, 10.4
 */

import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CCGrid } from '../../src/components/CCGrid';
import { ChannelSelector } from '../../src/components/ChannelSelector';
import { ConnectionStatus } from '../../src/components/ConnectionStatus';
import { ScanButton } from '../../src/components/ScanButton';
import { SyncProgress } from '../../src/components/SyncProgress';
import { useBLEController } from '../../src/hooks/useBLEController';

export default function ControllerScreen() {
  const {
    connectionState,
    error,
    scanAndConnect,
    disconnect,
    sendCC,
    syncChannel,
  } = useBLEController();

  const [selectedChannel, setSelectedChannel] = useState(1);

  // Track which channels have been synced to trigger bulk read on first selection
  const syncedChannelsRef = useRef<Set<number>>(new Set());

  /**
   * Handle channel selection:
   * - Update CCGrid to show the new channel's values
   * - Trigger bulk read if channel not yet synced and device is connected
   */
  const handleChannelChange = useCallback(
    (channel: number) => {
      setSelectedChannel(channel);

      // If connected and channel hasn't been synced yet, trigger bulk read
      if (connectionState === 'connected' && !syncedChannelsRef.current.has(channel)) {
        syncedChannelsRef.current.add(channel);
        syncChannel(channel).catch(() => {
          // Error is already propagated to Connection Store by the hook
          // Remove from synced set so user can retry
          syncedChannelsRef.current.delete(channel);
        });
      }
    },
    [connectionState, syncChannel],
  );

  /**
   * Handle slider interaction: call sendCC on sliding complete.
   * The hook handles optimistic update and rollback on failure.
   */
  const handleSlidingComplete = useCallback(
    (controller: number, value: number) => {
      sendCC(selectedChannel, controller, value).catch(() => {
        // Error is already propagated to Connection Store by the hook
      });
    },
    [selectedChannel, sendCC],
  );

  /**
   * Mark all channels as synced after a full sync (initial connection).
   * This is triggered when connection state transitions to 'connected'.
   */
  React.useEffect(() => {
    if (connectionState === 'connected') {
      // After full sync, mark all 16 channels as synced
      for (let ch = 1; ch <= 16; ch++) {
        syncedChannelsRef.current.add(ch);
      }
    } else if (connectionState === 'disconnected') {
      // Reset synced channels on disconnect
      syncedChannelsRef.current.clear();
    }
  }, [connectionState]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Connection Status Badge */}
      <View style={styles.header}>
        <ConnectionStatus />
      </View>

      {/* Sync Progress Indicator */}
      <SyncProgress />

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Channel Selector */}
      <ChannelSelector
        selectedChannel={selectedChannel}
        onChannelChange={handleChannelChange}
      />

      {/* CC Grid - 128 sliders for selected channel */}
      <CCGrid
        channel={selectedChannel}
        onSlidingComplete={handleSlidingComplete}
      />

      {/* Scan/Connect/Disconnect Button */}
      <View style={styles.footer}>
        <ScanButton
          connectionState={connectionState}
          onScanAndConnect={scanAndConnect}
          onDisconnect={disconnect}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  errorContainer: {
    marginHorizontal: 16,
    marginVertical: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 8,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
