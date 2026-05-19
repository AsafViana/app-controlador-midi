import Slider from '@react-native-community/slider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface CCSliderProps {
    ccNumber: number;
    value: number;
    onValueChange: (value: number) => void;
    onSlidingComplete: (value: number) => void;
}

export const CCSlider = React.memo(function CCSlider({
    ccNumber,
    value,
    onValueChange,
    onSlidingComplete,
}: CCSliderProps) {
    return (
        <View style={styles.row}>
            <Text style={styles.label}>CC {ccNumber}</Text>
            <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={127}
                step={1}
                value={value}
                onValueChange={onValueChange}
                onSlidingComplete={onSlidingComplete}
                minimumTrackTintColor="#2196F3"
                maximumTrackTintColor="#BDBDBD"
                thumbTintColor="#1976D2"
            />
            <Text style={styles.value}>{value}</Text>
        </View>
    );
});

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    label: {
        width: 50,
        fontSize: 12,
        fontWeight: '600',
        color: '#424242',
    },
    slider: {
        flex: 1,
        height: 32,
    },
    value: {
        width: 32,
        fontSize: 12,
        fontWeight: '600',
        color: '#424242',
        textAlign: 'right',
    },
});
