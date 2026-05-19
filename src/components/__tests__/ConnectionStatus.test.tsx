import { act, render } from '@testing-library/react-native';
import React from 'react';

import { useConnectionStore, type ConnectionState } from '../../stores/connection-store';
import { ConnectionStatus } from '../ConnectionStatus';

describe('ConnectionStatus', () => {
    beforeEach(() => {
        act(() => {
            useConnectionStore.getState().reset();
        });
    });

    const stateExpectations: {
        state: ConnectionState;
        label: string;
        color: string;
    }[] = [
            { state: 'disconnected', label: 'Desconectado', color: '#9E9E9E' },
            { state: 'scanning', label: 'Escaneando...', color: '#2196F3' },
            { state: 'connecting', label: 'Conectando...', color: '#FFC107' },
            { state: 'syncing', label: 'Sincronizando...', color: '#FFC107' },
            { state: 'connected', label: 'Conectado', color: '#4CAF50' },
            { state: 'reconnecting', label: 'Reconectando...', color: '#FF9800' },
            { state: 'bluetooth_unavailable', label: 'Bluetooth Indisponível', color: '#F44336' },
        ];

    it.each(stateExpectations)(
        'renders "$label" with color $color when state is "$state"',
        ({ state, label, color }) => {
            act(() => {
                useConnectionStore.getState().setState(state);
            });

            const { getByText } = render(<ConnectionStatus />);

            const textElement = getByText(label);
            expect(textElement).toBeTruthy();

            // getByText returns the text node; parent is the Text component,
            // grandparent is the View (badge) with the background color style
            const badge = textElement.parent?.parent;
            expect(badge).toBeTruthy();

            // Flatten the style array to check backgroundColor
            const badgeStyle = badge!.props.style;
            const styles = Array.isArray(badgeStyle) ? badgeStyle : [badgeStyle];
            const flatStyle = Object.assign({}, ...styles.filter(Boolean));
            expect(flatStyle.backgroundColor).toBe(color);
        },
    );

    it('displays reconnect attempt number when in reconnecting state', () => {
        act(() => {
            useConnectionStore.getState().setState('reconnecting');
            useConnectionStore.getState().setReconnectAttempt(3);
        });

        const { getByText } = render(<ConnectionStatus />);

        expect(getByText('Reconectando... (3/5)')).toBeTruthy();
    });

    it('does not display attempt number when reconnectAttempt is 0', () => {
        act(() => {
            useConnectionStore.getState().setState('reconnecting');
            useConnectionStore.getState().setReconnectAttempt(0);
        });

        const { getByText } = render(<ConnectionStatus />);

        expect(getByText('Reconectando...')).toBeTruthy();
    });

    it('renders initial state as disconnected', () => {
        const { getByText } = render(<ConnectionStatus />);

        expect(getByText('Desconectado')).toBeTruthy();
    });

    it('updates reactively when connection state changes', () => {
        const { getByText, rerender } = render(<ConnectionStatus />);

        expect(getByText('Desconectado')).toBeTruthy();

        act(() => {
            useConnectionStore.getState().setState('connected');
        });
        rerender(<ConnectionStatus />);

        expect(getByText('Conectado')).toBeTruthy();
    });
});
