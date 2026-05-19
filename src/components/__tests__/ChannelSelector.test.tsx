import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { ChannelSelector } from '../ChannelSelector';

describe('ChannelSelector', () => {
    const mockOnChannelChange = jest.fn();

    beforeEach(() => {
        mockOnChannelChange.mockClear();
    });

    it('renders 16 channel buttons', () => {
        const { getAllByRole } = render(
            <ChannelSelector
                selectedChannel={1}
                onChannelChange={mockOnChannelChange}
            />
        );

        const buttons = getAllByRole('button');
        expect(buttons).toHaveLength(16);
    });

    it('displays channel numbers 1 through 16', () => {
        const { getByText } = render(
            <ChannelSelector
                selectedChannel={1}
                onChannelChange={mockOnChannelChange}
            />
        );

        for (let i = 1; i <= 16; i++) {
            expect(getByText(String(i))).toBeTruthy();
        }
    });

    it('highlights the selected channel', () => {
        const { getByLabelText } = render(
            <ChannelSelector
                selectedChannel={5}
                onChannelChange={mockOnChannelChange}
            />
        );

        const selectedButton = getByLabelText('Canal 5');
        expect(selectedButton.props.accessibilityState).toEqual({
            selected: true,
        });

        const unselectedButton = getByLabelText('Canal 3');
        expect(unselectedButton.props.accessibilityState).toEqual({
            selected: false,
        });
    });

    it('calls onChannelChange when a different channel is pressed', () => {
        const { getByLabelText } = render(
            <ChannelSelector
                selectedChannel={1}
                onChannelChange={mockOnChannelChange}
            />
        );

        fireEvent.press(getByLabelText('Canal 8'));
        expect(mockOnChannelChange).toHaveBeenCalledWith(8);
        expect(mockOnChannelChange).toHaveBeenCalledTimes(1);
    });

    it('calls onChannelChange even when pressing the already selected channel', () => {
        const { getByLabelText } = render(
            <ChannelSelector
                selectedChannel={3}
                onChannelChange={mockOnChannelChange}
            />
        );

        fireEvent.press(getByLabelText('Canal 3'));
        expect(mockOnChannelChange).toHaveBeenCalledWith(3);
    });

    it('defaults to channel 1 selected when selectedChannel is 1', () => {
        const { getByLabelText } = render(
            <ChannelSelector
                selectedChannel={1}
                onChannelChange={mockOnChannelChange}
            />
        );

        const firstButton = getByLabelText('Canal 1');
        expect(firstButton.props.accessibilityState).toEqual({
            selected: true,
        });
    });
});
