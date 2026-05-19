import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { CCSlider } from '../CCSlider';

// Mock @react-native-community/slider
jest.mock('@react-native-community/slider', () => {
    const { View } = require('react-native');
    const React = require('react');

    return {
        __esModule: true,
        default: React.forwardRef(
            (
                props: {
                    value?: number;
                    onValueChange?: (value: number) => void;
                    onSlidingComplete?: (value: number) => void;
                    testID?: string;
                },
                _ref: unknown
            ) => {
                return React.createElement(View, {
                    testID: props.testID ?? 'slider',
                    accessibilityRole: 'adjustable',
                    accessibilityValue: { now: props.value },
                    onValueChange: props.onValueChange,
                    onSlidingComplete: props.onSlidingComplete,
                });
            }
        ),
    };
});

describe('CCSlider', () => {
    const mockOnValueChange = jest.fn();
    const mockOnSlidingComplete = jest.fn();

    beforeEach(() => {
        mockOnValueChange.mockClear();
        mockOnSlidingComplete.mockClear();
    });

    it('displays the CC number label', () => {
        const { getByText } = render(
            <CCSlider
                ccNumber={74}
                value={64}
                onValueChange={mockOnValueChange}
                onSlidingComplete={mockOnSlidingComplete}
            />
        );

        expect(getByText('CC 74')).toBeTruthy();
    });

    it('displays the current numeric value', () => {
        const { getByText } = render(
            <CCSlider
                ccNumber={10}
                value={100}
                onValueChange={mockOnValueChange}
                onSlidingComplete={mockOnSlidingComplete}
            />
        );

        expect(getByText('100')).toBeTruthy();
    });

    it('displays value 0 correctly', () => {
        const { getByText } = render(
            <CCSlider
                ccNumber={0}
                value={0}
                onValueChange={mockOnValueChange}
                onSlidingComplete={mockOnSlidingComplete}
            />
        );

        expect(getByText('CC 0')).toBeTruthy();
        expect(getByText('0')).toBeTruthy();
    });

    it('displays max value 127 correctly', () => {
        const { getByText } = render(
            <CCSlider
                ccNumber={127}
                value={127}
                onValueChange={mockOnValueChange}
                onSlidingComplete={mockOnSlidingComplete}
            />
        );

        expect(getByText('CC 127')).toBeTruthy();
        expect(getByText('127')).toBeTruthy();
    });

    it('fires onSlidingComplete when sliding ends', () => {
        const { getByTestId } = render(
            <CCSlider
                ccNumber={50}
                value={64}
                onValueChange={mockOnValueChange}
                onSlidingComplete={mockOnSlidingComplete}
            />
        );

        const slider = getByTestId('slider');
        fireEvent(slider, 'onSlidingComplete', 100);

        expect(mockOnSlidingComplete).toHaveBeenCalledWith(100);
        expect(mockOnSlidingComplete).toHaveBeenCalledTimes(1);
    });

    it('fires onValueChange during sliding', () => {
        const { getByTestId } = render(
            <CCSlider
                ccNumber={50}
                value={64}
                onValueChange={mockOnValueChange}
                onSlidingComplete={mockOnSlidingComplete}
            />
        );

        const slider = getByTestId('slider');
        fireEvent(slider, 'onValueChange', 80);

        expect(mockOnValueChange).toHaveBeenCalledWith(80);
        expect(mockOnValueChange).toHaveBeenCalledTimes(1);
    });
});
