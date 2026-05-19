import React from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { TOTAL_CHANNELS } from '../ble/constants';

export interface ChannelSelectorProps {
    selectedChannel: number;
    onChannelChange: (channel: number) => void;
}

/**
 * Horizontal row of 16 channel buttons (1–16).
 * Highlights the selected channel with distinct contrast.
 */
export function ChannelSelector({
    selectedChannel,
    onChannelChange,
}: ChannelSelectorProps): React.JSX.Element {
    const channels = Array.from({ length: TOTAL_CHANNELS }, (_, i) => i + 1);

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {channels.map((channel) => {
                    const isSelected = channel === selectedChannel;
                    return (
                        <TouchableOpacity
                            key={channel}
                            style={[
                                styles.button,
                                isSelected
                                    ? styles.buttonSelected
                                    : styles.buttonUnselected,
                            ]}
                            onPress={() => onChannelChange(channel)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                            accessibilityLabel={`Canal ${channel}`}
                        >
                            <Text
                                style={[
                                    styles.buttonText,
                                    isSelected
                                        ? styles.textSelected
                                        : styles.textUnselected,
                                ]}
                            >
                                {channel}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 8,
    },
    scrollContent: {
        paddingHorizontal: 8,
        gap: 6,
    },
    button: {
        width: 40,
        height: 40,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonSelected: {
        backgroundColor: '#2196F3',
    },
    buttonUnselected: {
        backgroundColor: '#E0E0E0',
    },
    buttonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    textSelected: {
        color: '#FFFFFF',
    },
    textUnselected: {
        color: '#424242',
    },
});
