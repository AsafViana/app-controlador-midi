# Controlador MIDI BLE — Documentação da API para o App Cliente

## Visão Geral

Este documento contém tudo que você precisa para desenvolver o app Android (ou qualquer cliente BLE) que se conecta ao **Controlador MIDI Modular** via Bluetooth Low Energy. O controlador expõe um servidor GATT que permite:

- **Escrever** valores CC remotamente (o controlador envia via USB/DIN MIDI)
- **Ler** o valor atual de qualquer CC
- **Receber notificações** em tempo real quando um CC muda (potenciômetro local, MIDI IN, ou outro write BLE)
- **Bulk read** de todos os 128 CCs de um canal de uma vez

---

## 1. Descoberta e Conexão

### Advertising

| Parâmetro | Valor |
|-----------|-------|
| Device Name | `Controlador MIDI BLE` |
| Service UUID anunciado | `0000ff00-0000-1000-8000-00805f9b34fb` |
| Scan Response | Habilitado |

### Regras de Conexão

- **Apenas 1 cliente por vez.** Se um segundo cliente tentar conectar, será rejeitado.
- Após desconexão, o controlador volta a fazer advertising em < 500ms.
- O controlador solicita connection interval de **7.5ms–30ms** (6–24 unidades de 1.25ms).

### Fluxo de Conexão (React Native)

```typescript
import { BleManager } from 'react-native-ble-plx';

const manager = new BleManager();

// 1. Scan por dispositivos com o service UUID
manager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
  if (device?.name === 'Controlador MIDI BLE') {
    manager.stopDeviceScan();
    // 2. Conectar
    connectToDevice(device);
  }
});

// 3. Conectar e descobrir serviços
async function connectToDevice(device) {
  const connected = await device.connect({ requestMTU: 185 });
  await connected.discoverAllServicesAndCharacteristics();
  // Pronto para usar characteristics ff01 e ff02
}
```

---

## 2. Estrutura GATT

### Serviço: MIDI CC Remote Control

| UUID | `0000ff00-0000-1000-8000-00805f9b34fb` |
|------|----------------------------------------|

### Characteristics

| Nome | UUID | Propriedades | Descrição |
|------|------|-------------|-----------|
| CC Read/Write | `0000ff01-0000-1000-8000-00805f9b34fb` | Read, Write, Notify | Leitura/escrita individual de CC + notificações de mudança |
| Bulk Read | `0000ff02-0000-1000-8000-00805f9b34fb` | Read, Write | Leitura de todos os 128 CCs de um canal |

### Descriptors

| Descriptor | UUID | Localização |
|-----------|------|-------------|
| CCCD (Client Characteristic Configuration) | `00002902-0000-1000-8000-00805f9b34fb` | Na characteristic CC Read/Write (`0000ff01`) |

---

## 3. Protocolo Binário

### Formato da Mensagem CC (3 bytes)

```
┌──────────┬──────────────────┬──────────┐
│ Byte 0   │ Byte 1           │ Byte 2   │
├──────────┼──────────────────┼──────────┤
│ channel  │ controller_number│ cc_value │
│ (1–16)   │ (0–127)          │ (0–127)  │
└──────────┴──────────────────┴──────────┘
```

| Campo | Tipo | Range Válido | Descrição |
|-------|------|-------------|-----------|
| `channel` | uint8 | 1–16 | Canal MIDI (NÃO é zero-indexed) |
| `controller_number` | uint8 | 0–127 | Número do CC MIDI |
| `cc_value` | uint8 | 0–127 | Valor do CC |

**Importante:** O canal começa em **1** (não 0). Canal 0 é inválido.

### Formato Usado Em

- ✅ Write commands (app → controlador)
- ✅ Read responses (controlador → app)
- ✅ Notifications (controlador → app)

---

## 4. Operações

### 4.1 Escrever um CC (Remote CC Write)

Envia um valor CC para o controlador. O controlador irá:

1. Validar a mensagem
2. Atualizar o CC State Store interno
3. Enviar a mensagem MIDI via USB e DIN
4. Notificar o app de volta (se inscrito)

**Characteristic:** `0000ff01`  
**Operação:** GATT Write  
**Payload:** 3 bytes `[channel, controller, value]`

```typescript
// Exemplo: Setar CC #74 no canal 1 para valor 100
const base64 = encodeCC({ channel: 1, controller: 74, value: 100 });
await device.writeCharacteristicWithResponseForService(SERVICE_UUID, CC_CHAR_UUID, base64);
```

**Respostas de erro (ATT Error Codes):**

| Condição | Comportamento |
|----------|--------------|
| Menos de 3 bytes | Rejeitado (ATT error) |
| `channel` = 0 ou > 16 | Rejeitado, CC State não modificado |
| `controller` > 127 | Rejeitado, CC State não modificado |
| `value` > 127 | Rejeitado, CC State não modificado |
| Mais de 3 bytes | Apenas os 3 primeiros bytes são processados |

**Timeout:** Se o processamento exceder 20ms, o comando é descartado silenciosamente.

---

### 4.2 Ler um CC (Remote CC Read)

Lê o valor atual de um CC específico.

**Characteristic:** `0000ff01`  
**Operação:** GATT Read  
**Resposta:** 3 bytes `[channel, controller, value]`

> **Nota:** Para ler um CC específico, primeiro escreva os 2 bytes de coordenada (channel + controller) e depois leia. O valor retornado será o estado atual no store.

---

### 4.3 Receber Notificações de Mudança

Quando qualquer CC muda (por potenciômetro local, MIDI IN, ou outro write BLE), o controlador envia uma notificação.

**Characteristic:** `0000ff01`  
**Operação:** Notification (após habilitar CCCD)  
**Payload:** 3 bytes `[channel, controller, new_value]`

#### Habilitar Notificações

```typescript
// react-native-ble-plx cuida do CCCD automaticamente
device.monitorCharacteristicForService(
  SERVICE_UUID,
  CC_CHAR_UUID,
  (error, characteristic) => {
    if (characteristic?.value) {
      const msg = decodeCC(characteristic.value);
      // msg = { channel, controller, value }
    }
  }
);
```

#### Receber Notificações

```typescript
// O callback acima é chamado automaticamente a cada mudança de CC.
// Exemplo de uso com state:
midiController.setOnCCChange((msg) => {
  console.log(`CC #${msg.controller} no canal ${msg.channel} = ${msg.value}`);
  // Atualizar UI
});
```

**Comportamento:**

- Notificações são enviadas em < 20ms após a mudança
- Se o app não está inscrito, notificações são descartadas (não enfileiradas)
- Se o app desconecta, notificações pendentes são perdidas

---

### 4.4 Bulk Read — Sincronizar Todos os CCs de um Canal

Para sincronização inicial (quando o app conecta), use o bulk read para obter todos os 128 valores CC de um canal de uma vez.

**Characteristic:** `0000ff02`  
**Protocolo:**

1. **Write** 1 byte com o canal desejado (1–16) na characteristic `0000ff02`
2. **Read** a characteristic `0000ff02` — retorna 128 bytes

```typescript
// Passo 1: Escrever o canal desejado
const request = encodeBulkRequest(5); // Canal 5
await device.writeCharacteristicWithResponseForService(SERVICE_UUID, BULK_CHAR_UUID, request);

// Passo 2: Ler o resultado (128 bytes)
const characteristic = await device.readCharacteristicForService(SERVICE_UUID, BULK_CHAR_UUID);
const values = decodeBulk(characteristic.value!);
// values[0] = valor do CC #0
// values[1] = valor do CC #1
// ...
// values[127] = valor do CC #127
```

**Formato da Resposta:**

```
┌─────────┬─────────┬─────────┬─────┬──────────┐
│ Byte 0  │ Byte 1  │ Byte 2  │ ... │ Byte 127 │
├─────────┼─────────┼─────────┼─────┼──────────┤
│ CC #0   │ CC #1   │ CC #2   │ ... │ CC #127  │
│ value   │ value   │ value   │     │ value    │
└─────────┴─────────┴─────────┴─────┴──────────┘
```

- Cada byte é o valor (0–127) do controller correspondente ao seu índice
- Ordem ascendente: byte[N] = valor do CC #N
- **Snapshot isolation:** Os valores são capturados atomicamente no momento do write. Mudanças que ocorrem durante a leitura (Read Blob) não afetam o resultado.

**Erros:**

- Canal 0 ou > 16: retorna 0 bytes (resposta vazia)

**ATT Long Read:** Se o MTU negociado for menor que 128 bytes, o BLE stack fragmenta automaticamente via Read Blob. O app Android lida com isso transparentemente.

---

### 4.5 Sincronização Completa (Todos os 16 Canais)

Para sincronizar o estado completo do controlador ao conectar:

```typescript
async function syncAllChannels(): Promise<number[][]> {
  const allChannels: number[][] = [];

  for (let ch = 1; ch <= 16; ch++) {
    const request = encodeBulkRequest(ch);
    await device.writeCharacteristicWithResponseForService(SERVICE_UUID, BULK_CHAR_UUID, request);
    const characteristic = await device.readCharacteristicForService(SERVICE_UUID, BULK_CHAR_UUID);
    const values = decodeBulk(characteristic.value!);
    allChannels.push(values!);
  }

  return allChannels; // allChannels[ch-1][controller] = value
}
```

Tempo estimado: < 200ms por canal × 16 = ~3.2s para sync completo.

---

## 5. Espaço de Endereçamento

| Dimensão | Range | Total |
|----------|-------|-------|
| Canais MIDI | 1–16 | 16 |
| Controllers por canal | 0–127 | 128 |
| **Total de parâmetros** | | **2048** |
| Valores possíveis por parâmetro | 0–127 | 128 |

Todos os valores iniciam em **0** quando o controlador liga.

---

## 6. Timing e Performance

| Operação | Latência Máxima |
|----------|----------------|
| CC Write → MIDI enviado | < 20ms |
| CC mudança local → Notificação BLE | < 20ms |
| Bulk read (128 bytes) | < 200ms |
| Advertising resume após desconexão | < 500ms |
| Connection interval | 7.5ms–30ms |

---

## 7. Tratamento de Erros no App

### Erros de Validação

| Cenário | O que acontece | O que fazer no app |
|---------|---------------|-------------------|
| Write com < 3 bytes | Rejeitado pelo controlador | Sempre enviar exatamente 3 bytes |
| Canal inválido (0 ou >16) | Rejeitado, sem efeito | Validar antes de enviar |
| Controller > 127 | Rejeitado, sem efeito | Validar antes de enviar |
| Value > 127 | Rejeitado, sem efeito | Clampar para 0–127 |
| Write com > 3 bytes | Apenas primeiros 3 processados | Enviar exatamente 3 bytes |

### Erros de Conexão

| Cenário | Comportamento do controlador | Recomendação para o app |
|---------|------------------------------|------------------------|
| Desconexão inesperada | Advertising resume em < 500ms | Reconectar automaticamente |
| Segundo app tenta conectar | Conexão rejeitada | Mostrar mensagem "outro dispositivo conectado" |
| Controlador reinicia | BLE re-inicializa em < 2s | Scan periódico para reconexão |
| BLE falha no controlador | MIDI continua sem BLE | Timeout de conexão → modo offline |

---

## 8. Fluxo Recomendado para o App

```
┌─────────────────────────────────────────────────────┐
│                    APP LIFECYCLE                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. SCAN por "Controlador MIDI BLE"                 │
│     └─ Filtrar por Service UUID 0000ff00            │
│                                                      │
│  2. CONNECT                                          │
│     └─ connectGatt(TRANSPORT_LE)                    │
│                                                      │
│  3. DISCOVER SERVICES                                │
│     └─ Obter characteristics ff01 e ff02            │
│                                                      │
│  4. HABILITAR NOTIFICAÇÕES                           │
│     └─ Escrever CCCD na ff01                        │
│                                                      │
│  5. SYNC INICIAL                                     │
│     └─ Bulk read (ff02) para cada canal usado       │
│                                                      │
│  6. OPERAÇÃO NORMAL                                  │
│     ├─ Receber notificações (mudanças locais)       │
│     ├─ Enviar writes (controle remoto)              │
│     └─ Atualizar UI em tempo real                   │
│                                                      │
│  7. DESCONEXÃO                                       │
│     └─ Reconectar automaticamente se inesperada     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 9. Referência Rápida de UUIDs

```
Service:         0000ff00-0000-1000-8000-00805f9b34fb
CC Read/Write:   0000ff01-0000-1000-8000-00805f9b34fb
Bulk Read:       0000ff02-0000-1000-8000-00805f9b34fb
CCCD:            00002902-0000-1000-8000-00805f9b34fb
```

---

## 10. Exemplos de Código (React Native com react-native-ble-plx)

### Biblioteca Recomendada

**[react-native-ble-plx](https://github.com/dotintent/react-native-ble-plx)** — a lib mais madura para BLE em React Native.

```bash
npm install react-native-ble-plx
# iOS: cd ios && pod install
```

### Constantes e UUIDs

```typescript
// src/ble/constants.ts
export const BLE_DEVICE_NAME = 'Controlador MIDI BLE';

export const SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
export const CC_CHAR_UUID = '0000ff01-0000-1000-8000-00805f9b34fb';
export const BULK_CHAR_UUID = '0000ff02-0000-1000-8000-00805f9b34fb';

export const CHANNEL_MIN = 1;
export const CHANNEL_MAX = 16;
export const CONTROLLER_MIN = 0;
export const CONTROLLER_MAX = 127;
export const VALUE_MIN = 0;
export const VALUE_MAX = 127;
```

### Protocolo — Encode/Decode

```typescript
// src/ble/protocol.ts
import { Buffer } from 'buffer'; // npm install buffer

export interface CCMessage {
  channel: number;   // 1–16
  controller: number; // 0–127
  value: number;      // 0–127
}

export function encodeCC(msg: CCMessage): string {
  // react-native-ble-plx usa base64 para dados binários
  const bytes = Buffer.from([msg.channel, msg.controller, msg.value]);
  return bytes.toString('base64');
}

export function decodeCC(base64: string): CCMessage | null {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 3) return null;

  const channel = bytes[0];
  const controller = bytes[1];
  const value = bytes[2];

  if (channel < 1 || channel > 16) return null;
  if (controller > 127) return null;
  if (value > 127) return null;

  return { channel, controller, value };
}

export function decodeBulk(base64: string): number[] | null {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length !== 128) return null;
  return Array.from(bytes);
}

export function encodeBulkRequest(channel: number): string {
  const bytes = Buffer.from([channel]);
  return bytes.toString('base64');
}

export function isValidCC(msg: CCMessage): boolean {
  return (
    msg.channel >= 1 && msg.channel <= 16 &&
    msg.controller >= 0 && msg.controller <= 127 &&
    msg.value >= 0 && msg.value <= 127
  );
}
```

### BLE Manager — Conexão e Operações

```typescript
// src/ble/bleManager.ts
import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
import { SERVICE_UUID, CC_CHAR_UUID, BULK_CHAR_UUID, BLE_DEVICE_NAME } from './constants';
import { encodeCC, decodeCC, decodeBulk, encodeBulkRequest, CCMessage } from './protocol';

class MidiControllerBLE {
  private manager: BleManager;
  private device: Device | null = null;
  private onCCChange: ((msg: CCMessage) => void) | null = null;
  private onConnectionChange: ((connected: boolean) => void) | null = null;

  constructor() {
    this.manager = new BleManager();
  }

  // ─── Scan e Conexão ─────────────────────────────────────────────────

  async scan(): Promise<Device[]> {
    const devices: Device[] = [];

    return new Promise((resolve) => {
      this.manager.startDeviceScan(
        [SERVICE_UUID], // Filtrar pelo service UUID
        null,
        (error, device) => {
          if (error) {
            console.warn('Scan error:', error);
            return;
          }
          if (device && device.name === BLE_DEVICE_NAME) {
            devices.push(device);
            this.manager.stopDeviceScan();
            resolve(devices);
          }
        }
      );

      // Timeout de 10s
      setTimeout(() => {
        this.manager.stopDeviceScan();
        resolve(devices);
      }, 10000);
    });
  }

  async connect(device: Device): Promise<void> {
    // Conectar
    this.device = await device.connect({ requestMTU: 185 });

    // Descobrir serviços
    await this.device.discoverAllServicesAndCharacteristics();

    // Monitorar desconexão
    this.device.onDisconnected((error, dev) => {
      this.device = null;
      this.onConnectionChange?.(false);
    });

    this.onConnectionChange?.(true);
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      await this.device.cancelConnection();
      this.device = null;
    }
  }

  isConnected(): boolean {
    return this.device !== null;
  }

  // ─── Notificações ───────────────────────────────────────────────────

  async enableNotifications(): Promise<void> {
    if (!this.device) throw new Error('Não conectado');

    this.device.monitorCharacteristicForService(
      SERVICE_UUID,
      CC_CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          console.warn('Notification error:', error);
          return;
        }
        if (characteristic?.value) {
          const msg = decodeCC(characteristic.value);
          if (msg) {
            this.onCCChange?.(msg);
          }
        }
      }
    );
  }

  // ─── Escrever CC ───────────────────────────────────────────────────

  async writeCC(channel: number, controller: number, value: number): Promise<void> {
    if (!this.device) throw new Error('Não conectado');

    const base64 = encodeCC({ channel, controller, value });

    await this.device.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      CC_CHAR_UUID,
      base64
    );
  }

  // ─── Bulk Read ─────────────────────────────────────────────────────

  async bulkRead(channel: number): Promise<number[]> {
    if (!this.device) throw new Error('Não conectado');

    // Passo 1: Escrever o canal desejado na characteristic bulk
    const request = encodeBulkRequest(channel);
    await this.device.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      BULK_CHAR_UUID,
      request
    );

    // Passo 2: Ler o snapshot de 128 bytes
    const characteristic = await this.device.readCharacteristicForService(
      SERVICE_UUID,
      BULK_CHAR_UUID
    );

    if (!characteristic.value) {
      throw new Error('Bulk read retornou vazio — canal inválido?');
    }

    const values = decodeBulk(characteristic.value);
    if (!values) {
      throw new Error('Bulk read retornou dados inválidos');
    }

    return values;
  }

  // ─── Sync Completo ─────────────────────────────────────────────────

  async syncAllChannels(): Promise<number[][]> {
    const allChannels: number[][] = [];

    for (let ch = 1; ch <= 16; ch++) {
      const values = await this.bulkRead(ch);
      allChannels.push(values);
    }

    return allChannels; // allChannels[ch-1][controller] = value
  }

  // ─── Callbacks ─────────────────────────────────────────────────────

  setOnCCChange(callback: (msg: CCMessage) => void) {
    this.onCCChange = callback;
  }

  setOnConnectionChange(callback: (connected: boolean) => void) {
    this.onConnectionChange = callback;
  }

  // ─── Cleanup ───────────────────────────────────────────────────────

  destroy() {
    this.manager.destroy();
  }
}

export const midiController = new MidiControllerBLE();
```

### Hook React para usar no app

```typescript
// src/hooks/useMidiController.ts
import { useState, useEffect, useCallback } from 'react';
import { midiController } from '../ble/bleManager';
import { CCMessage } from '../ble/protocol';

export function useMidiController() {
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ccState, setCCState] = useState<number[][]>(
    Array.from({ length: 16 }, () => new Array(128).fill(0))
  );

  useEffect(() => {
    midiController.setOnConnectionChange(setConnected);
    midiController.setOnCCChange((msg: CCMessage) => {
      setCCState(prev => {
        const next = [...prev];
        next[msg.channel - 1] = [...next[msg.channel - 1]];
        next[msg.channel - 1][msg.controller] = msg.value;
        return next;
      });
    });

    return () => midiController.destroy();
  }, []);

  const scanAndConnect = useCallback(async () => {
    setScanning(true);
    try {
      const devices = await midiController.scan();
      if (devices.length > 0) {
        await midiController.connect(devices[0]);
        await midiController.enableNotifications();
        // Sync canal 1 por padrão
        const values = await midiController.bulkRead(1);
        setCCState(prev => {
          const next = [...prev];
          next[0] = values;
          return next;
        });
      }
    } finally {
      setScanning(false);
    }
  }, []);

  const sendCC = useCallback(async (channel: number, controller: number, value: number) => {
    await midiController.writeCC(channel, controller, value);
    // Atualizar estado local otimisticamente
    setCCState(prev => {
      const next = [...prev];
      next[channel - 1] = [...next[channel - 1]];
      next[channel - 1][controller] = value;
      return next;
    });
  }, []);

  const syncChannel = useCallback(async (channel: number) => {
    const values = await midiController.bulkRead(channel);
    setCCState(prev => {
      const next = [...prev];
      next[channel - 1] = values;
      return next;
    });
  }, []);

  return {
    connected,
    scanning,
    ccState,
    scanAndConnect,
    sendCC,
    syncChannel,
    disconnect: () => midiController.disconnect(),
  };
}
```

### Exemplo de Componente — Slider de CC

```tsx
// src/components/CCSlider.tsx
import React from 'react';
import { View, Text } from 'react-native';
import Slider from '@react-native-community/slider';
import { useMidiController } from '../hooks/useMidiController';

interface Props {
  channel: number;
  controller: number;
  label: string;
}

export function CCSlider({ channel, controller, label }: Props) {
  const { ccState, sendCC } = useMidiController();
  const value = ccState[channel - 1][controller];

  return (
    <View style={{ padding: 12 }}>
      <Text>{label} (CC #{controller}, Ch {channel})</Text>
      <Slider
        minimumValue={0}
        maximumValue={127}
        step={1}
        value={value}
        onSlidingComplete={(val) => sendCC(channel, controller, Math.round(val))}
      />
      <Text style={{ textAlign: 'right' }}>{value}</Text>
    </View>
  );
}
```

---

## 11. Checklist de Implementação do App (React Native)

- [ ] Instalar `react-native-ble-plx` e `buffer`
- [ ] Configurar permissões BLE (Android: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION`; iOS: `NSBluetoothAlwaysUsageDescription`)
- [ ] Criar módulo de protocolo (encode/decode 3 bytes, bulk decode 128 bytes)
- [ ] Scan BLE filtrando por Service UUID `0000ff00`
- [ ] Conectar ao dispositivo "Controlador MIDI BLE" com MTU alto (185+)
- [ ] Descobrir serviços e obter characteristics `ff01` e `ff02`
- [ ] Habilitar notificações via `monitorCharacteristicForService` na `ff01`
- [ ] Implementar sync inicial via bulk read (`ff02`) — write canal + read 128 bytes
- [ ] Implementar envio de CC writes (`ff01`) com `writeCharacteristicWithResponseForService`
- [ ] Processar notificações de mudança em tempo real e atualizar state
- [ ] Validar todos os valores antes de enviar (channel 1–16, controller 0–127, value 0–127)
- [ ] Tratar desconexão com reconexão automática (`onDisconnected`)
- [ ] Mostrar estado de conexão na UI
- [ ] Tratar caso de "outro dispositivo já conectado" (conexão falha)
- [ ] Implementar UI com sliders/knobs para controle de CC
- [ ] Testar com MTU pequeno (bulk read usa ATT Long Read automaticamente)

### Dependências Recomendadas

```json
{
  "react-native-ble-plx": "^3.x",
  "buffer": "^6.x",
  "@react-native-community/slider": "^4.x"
}
```

### Permissões Android (`AndroidManifest.xml`)

```xml
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

### Permissões iOS (`Info.plist`)

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Necessário para conectar ao Controlador MIDI via Bluetooth</string>
```
