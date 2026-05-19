import React, { useCallback } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { TOTAL_CONTROLLERS } from '../ble/constants';
import { useCCStore } from '../stores/cc-store';
import { CCSlider } from './CCSlider';

export interface CCGridProps {
    /** Selected MIDI channel (1–16) */
    channel: number;
    /** Called when user adjusts a slider during interaction (visual feedback) */
    onValueChange?: (controller: number, value: number) => void;
    /** Called when user finishes sliding (triggers BLE write) */
    onSlidingComplete?: (controller: number, value: number) => void;
}

/** Array of CC numbers [0, 1, 2, ..., 127] used as FlatList data */
const CC_NUMBERS = Array.from({ length: TOTAL_CONTROLLERS }, (_, i) => i);

/** Extract key from CC number for FlatList */
const keyExtractor = (_item: number, index: number) => String(index);

/**
 * Individual CC item that subscribes to its own value from the store.
 * Uses a Zustand selector so it only re-renders when its specific CC value changes.
 */
const CCGridItem = React.memo(function CCGridItem({
    channel,
    ccNumber,
    onValueChange,
    onSlidingComplete,
}: {
    channel: number;
    ccNumber: number;
    onValueChange?: (controller: number, value: number) => void;
    onSlidingComplete?: (controller: number, value: number) => void;
}) {
    const value = useCCStore(
        useCallback(
            (state) => state.values[channel - 1][ccNumber],
            [channel, ccNumber]
        )
    );

    const handleValueChange = useCallback(
        (val: number) => {
            onValueChange?.(ccNumber, val);
        },
        [ccNumber, onValueChange]
    );

    const handleSlidingComplete = useCallback(
        (val: number) => {
            onSlidingComplete?.(ccNumber, val);
        },
        [ccNumber, onSlidingComplete]
    );

    return (
        <CCSlider
            ccNumber={ccNumber}
            value={value}
            onValueChange={handleValueChange}
            onSlidingComplete={handleSlidingComplete}
        />
    );
});

/**
 * Scrollable grid rendering 128 CCSlider components for the selected channel.
 * Uses FlatList for virtualization and per-item Zustand selectors to prevent
 * unnecessary re-renders (only the slider whose value changed will re-render).
 */
export function CCGrid({ channel, onValueChange, onSlidingComplete }: CCGridProps) {
    const renderItem = useCallback(
        ({ item }: { item: number }) => (
            <CCGridItem
                channel={channel}
                ccNumber={item}
                onValueChange={onValueChange}
                onSlidingComplete={onSlidingComplete}
            />
        ),
        [channel, onValueChange, onSlidingComplete]
    );

    return (
        <FlatList
            data={CC_NUMBERS}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            style={styles.list}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={5}
            getItemLayout={getItemLayout}
            showsVerticalScrollIndicator={true}
        />
    );
}

/** Fixed item height for getItemLayout optimization (paddingVertical 6 * 2 + slider height 32 = 44) */
const ITEM_HEIGHT = 44;

function getItemLayout(_data: ArrayLike<number> | null | undefined, index: number) {
    return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index };
}

const styles = StyleSheet.create({
    list: {
        flex: 1,
    },
});
