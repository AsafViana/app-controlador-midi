# 📱 Instrução de Agente — App React Native: Conexão BLE com ESP32-S3

> **Princípio:** "O óbvio deve ser dito." Este documento assume que o leitor NÃO tem conhecimento prévio de BLE, react-native-ble-plx, ou protocolos binários. Tudo está explicado passo a passo.

---

## 📋 Sumário

1. [Contexto e Visão Geral](#1-contexto-e-visão-geral)
2. [O que é BLE (Bluetooth Low Energy) — Para o Dev Mobile](#2-o-que-é-ble-bluetooth-low-energy--para-o-dev-mobile)
3. [Arquitetura da Solução](#3-arquitetura-da-solução)
4. [Setup do Projeto](#4-setup-do-projeto)
5. [Permissões (Android e iOS)](#5-permissões-android-e-ios)
6. [Estrutura de Pastas](#6-estrutura-de-pastas)
7. [Código Completo — Passo a Passo](#7-código-completo--passo-a-passo)
8. [Protocolo de Comunicação](#8-protocolo-de-comunicação)
9. [Telas do App](#9-telas-do-app)
10. [Reconexão Automática](#10-reconexão-automática)
11. [Testes e Debug](#11-testes-e-debug)
12. [Problemas Comuns e Soluções](#12-problemas-comuns-e-soluções)
13. [Background Mode](#13-background-mode)
14. [Checklist de Entrega](#14-checklist-de-entrega)

---

## 1. Contexto e Visão Geral

### O que estamos fazendo?

Estamos criando um **aplicativo React Native** que conecta via **Bluetooth Low Energy (BLE)** a uma placa **ESP32-S3**. O app envia comandos e recebe respostas/dados do dispositivo.

### Papel do App nesta solução

O app atua como **GATT Client** (também chamado de **Central**). Em termos simples:
- O app **procura** dispositivos BLE no ar (scan)
- O app **conecta** ao dispositivo encontrado
- O app **escreve bytes** em uma "caixa de correio" do dispositivo para enviar comandos
- O app **recebe notificações** quando o dispositivo tem dados para entregar

### Papel da ESP32-S3

A ESP32-S3 atua como **GATT Server** (também chamado de **Peripheral**). Ela anuncia sua presença e espera o app conectar.

### Biblioteca BLE que usamos

**`react-native-ble-plx`** — É a biblioteca BLE mais madura para React Native. Ela:
- Funciona em iOS e Android
- Suporta scan, connect, read, write, notify
- Gerencia o ciclo de vida da conexão
- Abstrai diferenças entre iOS e Android

### Fluxo resumido

```
[1] App abre → verifica permissões
[2] Usuário toca "Escanear" → app faz scan BLE
[3] Lista de dispositivos encontrados aparece
[4] Usuário toca em um dispositivo → app conecta
[5] App descobre services/characteristics
[6] App assina notifications (TX)
[7] App está pronto para enviar/receber dados
```

---

## 2. O que é BLE (Bluetooth Low Energy) — Para o Dev Mobile

### Conceitos que você PRECISA saber

| Conceito | O que é | Analogia Mobile |
|----------|---------|-----------------|
| **Scan** | Procurar dispositivos BLE próximos | Como buscar redes WiFi disponíveis |
| **Connect** | Estabelecer conexão com um device | Como conectar a uma rede WiFi |
| **Service** | Grupo de funcionalidades no device | Como um endpoint `/api/v1/...` |
| **Characteristic** | Um dado específico dentro de um Service | Como um campo num JSON |
| **Write** | Enviar dados para o device | Como fazer um POST |
| **Notify** | Receber dados do device em tempo real | Como um WebSocket/push notification |
| **Subscribe** | Habilitar recebimento de notifications | Como se inscrever num canal |
| **MTU** | Tamanho máximo de um pacote | Como o `maxBodySize` de um request |
| **UUID** | Identificador único de um Service/Char | Como a URL de um endpoint |

### Diferenças importantes entre iOS e Android no BLE

| Aspecto | Android | iOS |
|---------|---------|-----|
| Permissões | BLUETOOTH_SCAN + BLUETOOTH_CONNECT + LOCATION | NSBluetooth...Usage (Info.plist) |
| MTU padrão | 23 bytes (precisa chamar requestMTU) | Negocia automaticamente |
| Background | Precisa Foreground Service | Funciona com background modes |
| Scan com tela off | Não funciona sem service | Funciona com `CBCentralManager` |
| Device ID | MAC Address (muda se não bonded) | UUID gerado pelo iOS (estável) |
| Bonding | Gerenciado pelo sistema | Gerenciado pelo sistema |

### UUIDs — O que são e como usar

UUIDs identificam services e characteristics. São strings de 128 bits no formato:
```
XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
```

Os UUIDs usados neste projeto (definidos pelo time de firmware):

| Elemento | UUID | Para que serve |
|----------|------|----------------|
| **Service** | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | Identifica nosso serviço BLE |
| **Char RX** | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` | App ESCREVE aqui (envia comandos) |
| **Char TX** | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` | App RECEBE dados aqui (notify) |

> ⚠️ **CRÍTICO:** RX/TX são nomeados do ponto de vista da ESP32. Do ponto de vista do APP:
> - **RX** = onde o app **escreve** (envia para a ESP)
> - **TX** = onde o app **lê/recebe** notificações (recebe da ESP)

---

## 3. Arquitetura da Solução

### Diagrama de Comunicação

```
┌────────────────────────────────────────────────────┐
│  REACT NATIVE APP (GATT Client / Central)          │
│                                                    │
│  ┌───────────┐   ┌──────────┐   ┌──────────────┐ │
│  │ UI Screen │──►│  Hook    │──►│ BleManager   │ │
│  │ (React)   │◄──│ (useBle) │◄──│ (Singleton)  │ │
│  └───────────┘   └──────────┘   └──────┬───────┘ │
│                                         │         │
│  ┌──────────────────────────────────────┘         │
│  │                                                │
│  │  ┌──────────────┐                             │
│  └─►│  Protocol    │ ← Encode/Decode pacotes     │
│     │  (bytes)     │                             │
│     └──────┬───────┘                             │
└────────────┼─────────────────────────────────────┘
             │
             │ BLE (over-the-air)
             │
             │  Write (App → ESP): Char RX UUID
             │  Notify (ESP → App): Char TX UUID
             │
┌────────────┼─────────────────────────────────────┐
│  ESP32-S3  │ (GATT Server / Peripheral)          │
│            ▼                                      │
│  ┌──────────────┐                                │
│  │  NimBLE      │ ← Recebe writes, envia notify  │
│  │  GATT Server │                                │
│  └──────────────┘                                │
└──────────────────────────────────────────────────┘
```

### Fluxo de dados detalhado

```
APP envia comando:
  1. Hook chama bleManager.sendPacket(CMD_SET_LED, [0x01])
  2. Protocol.encode() → [0xAA, 0x10, 0x00, 0x01, 0x01, 0xBA]
  3. Buffer convertido para Base64
  4. device.writeCharacteristic(RX_UUID, base64Data)
  5. Bytes vão pelo ar via BLE
  6. ESP recebe e processa

ESP envia resposta:
  1. ESP chama ble_gatt_send_packet(CMD_ACK, ...)
  2. NimBLE envia Notify na TX characteristic
  3. App recebe via monitorCharacteristic callback
  4. Dados chegam em Base64, convertidos para Buffer
  5. Protocol.decode() → { cmd: 0xFE, payload: [0x10] }
  6. Hook notifica a UI
```

---

## 4. Setup do Projeto

### 4.1. Criar projeto (se ainda não existe)

```bash
npx react-native init ESP32App --template react-native-template-typescript
cd ESP32App
```

### 4.2. Instalar dependências

```bash
# Biblioteca BLE principal
npm install react-native-ble-plx

# Manipulação de bytes (necessário para o protocolo)
npm install buffer

# Tipos TypeScript (se usar TS)
npm install --save-dev @types/react @types/react-native
```

### 4.3. Setup iOS

```bash
cd ios
pod install
cd ..
```

> ⚠️ Se `pod install` falhar com erro de versão mínima do iOS, verifique que `ios/Podfile` tem `platform :ios, '13.0'` ou superior.

### 4.4. Setup Android

**Nenhuma configuração especial necessária.** O `react-native-ble-plx` configura automaticamente via autolinking.

### 4.5. Verificar instalação

```bash
# iOS
npx react-native run-ios

# Android
npx react-native run-android
```

---

## 5. Permissões (Android e iOS)

### 5.1. Android — `android/app/src/main/AndroidManifest.xml`

Adicionar DENTRO da tag `<manifest>`, ANTES de `<application>`:

```xml
<!-- BLE requer localização no Android (é assim que funciona, não tem como evitar) -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<!-- Android 12+ (API 31+): permissões específicas de Bluetooth -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"
    android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

<!-- Android 11 e inferior: permissões legadas -->
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />

<!-- Declarar que o app usa BLE (para filtro no Google Play) -->
<uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
```

> **Por que precisa de LOCATION?** No Android, scan BLE pode revelar a localização do usuário (beacons, etc.), então o Google exige permissão de localização. É obrigatório — sem isso, o scan não funciona.

### 5.2. iOS — `ios/ESP32App/Info.plist`

Adicionar DENTRO do `<dict>` principal:

```xml
<!-- Mensagem que aparece quando o iOS pede permissão de Bluetooth -->
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Este app precisa do Bluetooth para conectar ao dispositivo ESP32.</string>

<!-- Necessário para scan BLE no iOS 13+ -->
<key>NSBluetoothPeripheralUsageDescription</key>
<string>Este app precisa do Bluetooth para conectar ao dispositivo ESP32.</string>

<!-- Se quiser funcionar em background (opcional) -->
<key>UIBackgroundModes</key>
<array>
    <string>bluetooth-central</string>
</array>
```

### 5.3. Solicitar permissões em runtime (Android)

No Android, além de declarar no Manifest, precisamos **pedir permissão em tempo de execução**. Isso é feito no código (ver seção do BleManager).

---

## 6. Estrutura de Pastas

```
src/
├── ble/
│   ├── constants.ts         ← UUIDs, comandos, configurações
│   ├── Protocol.ts          ← Encode/decode de pacotes binários
│   ├── BleManager.ts        ← Singleton que gerencia toda a comunicação BLE
│   └── types.ts             ← TypeScript interfaces/types
│
├── hooks/
│   ├── useBle.ts            ← Hook React para scan/connect/disconnect
│   ├── useDevice.ts         ← Hook React para comunicação (send/receive)
│   └── usePermissions.ts    ← Hook para solicitar permissões
│
├── screens/
│   ├── ScanScreen.tsx       ← Tela de scan e lista de devices
│   ├── DeviceScreen.tsx     ← Tela de controle do device conectado
│   └── DebugScreen.tsx      ← Tela de debug (log de pacotes)
│
├── components/
│   ├── DeviceCard.tsx       ← Card de um device encontrado
│   ├── StatusBadge.tsx      ← Badge de status da conexão
│   └── PacketLog.tsx        ← Componente de log de pacotes
│
├── navigation/
│   └── AppNavigator.tsx     ← Stack navigation
│
└── App.tsx                  ← Entry point
```

---

## 7. Código Completo — Passo a Passo

### 7.1. `src/ble/constants.ts`

```typescript
/**
 * CONSTANTES BLE
 *
 * Este arquivo contém TODAS as constantes de configuração BLE.
 * Se qualquer UUID ou configuração mudar, mude AQUI e o resto
 * do código se adapta automaticamente.
 */

// ============================================================
// UUIDs
// Estes UUIDs DEVEM ser idênticos aos definidos no firmware!
// Se o firmware mudar os UUIDs, mude aqui também.
// Formato: string lowercase com hifens
// ============================================================

/** UUID do Service BLE principal */
export const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

/**
 * UUID da Characteristic RX (Receive, do ponto de vista da ESP)
 * O APP ESCREVE nesta characteristic para enviar dados PARA a ESP.
 */
export const CHAR_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

/**
 * UUID da Characteristic TX (Transmit, do ponto de vista da ESP)
 * O APP RECEBE dados desta characteristic (via Notify).
 * Precisa fazer Subscribe para começar a receber.
 */
export const CHAR_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/** Prefixo do nome do dispositivo (para filtrar no scan) */
export const DEVICE_NAME_PREFIX = 'ESP32S3';

// ============================================================
// PROTOCOLO
// ============================================================

/** Byte que marca o início de todo pacote válido */
export const PROTO_START_BYTE = 0xaa;

/** Tempo máximo para esperar um ACK (milliseconds) */
export const ACK_TIMEOUT_MS = 3000;

/** Número máximo de tentativas de envio */
export const MAX_RETRIES = 3;

/** Tamanho máximo do payload em bytes */
export const MAX_PAYLOAD_SIZE = 480;

// ============================================================
// COMANDOS
// Cada comando é 1 byte. Os valores devem ser iguais aos do firmware.
// ============================================================
export enum Command {
  /** App → ESP: Teste de conexão. ESP deve responder com PONG. */
  PING = 0x01,

  /** ESP → App: Resposta ao PING. */
  PONG = 0x02,

  /** App → ESP: Ligar/desligar LED. Payload: [0x00=off, 0x01=on] */
  SET_LED = 0x10,

  /** App → ESP: Solicitar status do dispositivo. Sem payload. */
  GET_STATUS = 0x20,

  /** ESP → App: Resposta de status. Payload: [state, error, battery] */
  STATUS_RESP = 0x21,

  /** Bidirecional: Dados genéricos. Payload: N bytes. */
  DATA = 0x30,

  /** App → ESP: Iniciar atualização OTA. Payload: [size(4), crc32(4)] */
  OTA_START = 0x40,

  /** App → ESP: Chunk de firmware. Payload: [seq(2), data...] */
  OTA_CHUNK = 0x41,

  /** App → ESP: Finalizar OTA. Sem payload. */
  OTA_END = 0x42,

  /** Bidirecional: Confirmação positiva. Payload: [cmd_confirmado] */
  ACK = 0xfe,

  /** Bidirecional: Rejeição/erro. Payload: [cmd_rejeitado, código_erro] */
  NACK = 0xff,
}

// ============================================================
// CONFIGURAÇÃO DE CONEXÃO
// ============================================================

/** Timeout para tentativa de conexão (ms) */
export const CONNECTION_TIMEOUT_MS = 10000;

/** Tempo de scan padrão (ms) */
export const SCAN_DURATION_MS = 10000;

/** MTU que solicitamos ao device (Android only, iOS negocia automaticamente) */
export const REQUESTED_MTU = 512;

/** Intervalo entre tentativas de reconexão (ms) */
export const RECONNECT_INTERVAL_MS = 3000;

/** Máximo de tentativas de reconexão automática */
export const MAX_RECONNECT_ATTEMPTS = 5;
```

### 7.2. `src/ble/types.ts`

```typescript
/**
 * TIPOS E INTERFACES
 *
 * Define todos os tipos usados na camada BLE.
 */

import { Command } from './constants';

/** Um pacote decodificado do protocolo */
export interface Packet {
  /** Comando (1 byte) */
  cmd: Command;
  /** Dados do comando (0 a 480 bytes) */
  payload: Buffer;
}

/** Status do dispositivo retornado pelo CMD_STATUS_RESP */
export interface DeviceStatus {
  /** 0x00=parado, 0x01=rodando */
  state: number;
  /** 0x00=sem erro, outros=código de erro */
  error: number;
  /** 0-100 porcentagem de bateria */
  battery: number;
}

/** Estado da conexão BLE */
export enum ConnectionState {
  /** Desconectado, sem atividade */
  DISCONNECTED = 'disconnected',
  /** Escaneando por dispositivos */
  SCANNING = 'scanning',
  /** Tentando conectar */
  CONNECTING = 'connecting',
  /** Conectado e pronto para comunicar */
  CONNECTED = 'connected',
  /** Tentando reconectar automaticamente */
  RECONNECTING = 'reconnecting',
}

/** Informações de um dispositivo encontrado no scan */
export interface ScannedDevice {
  /** ID do dispositivo (MAC no Android, UUID no iOS) */
  id: string;
  /** Nome do dispositivo (pode ser null) */
  name: string | null;
  /** Força do sinal em dBm (mais próximo de 0 = mais forte) */
  rssi: number | null;
}

/** Listener para pacotes recebidos */
export type PacketListener = (packet: Packet) => void;

/** Listener para mudanças de estado da conexão */
export type ConnectionListener = (state: ConnectionState) => void;
```

### 7.3. `src/ble/Protocol.ts`

```typescript
/**
 * PROTOCOLO DE COMUNICAÇÃO
 *
 * Este arquivo implementa o encode/decode do protocolo binário
 * usado para comunicação entre App e ESP32-S3.
 *
 * FORMATO DO PACOTE:
 * ┌───────────┬─────────┬──────────────┬─────────────────┬───────────┐
 * │  START    │   CMD   │   LENGTH     │    PAYLOAD      │  CHECKSUM │
 * │  0xAA     │  1 byte │  2 bytes BE  │  0-480 bytes    │  XOR      │
 * │  (1 byte) │         │  (Big Endian)│                 │  (1 byte) │
 * └───────────┴─────────┴──────────────┴─────────────────┴───────────┘
 *
 * - START: Sempre 0xAA. Identifica início de pacote.
 * - CMD: Código do comando (ver enum Command).
 * - LENGTH: Tamanho do payload em Big Endian (byte mais significativo primeiro).
 * - PAYLOAD: Dados do comando (0 a 480 bytes).
 * - CHECKSUM: XOR de todos os bytes anteriores (start até último byte do payload).
 *
 * EXEMPLO - Pacote PING (sem payload):
 *   Bytes: [0xAA, 0x01, 0x00, 0x00, 0xAB]
 *          START  CMD   LEN_HI LEN_LO CHECKSUM
 *   Checksum: 0xAA ^ 0x01 ^ 0x00 ^ 0x00 = 0xAB ✓
 */

import { Buffer } from 'buffer';
import { Command, PROTO_START_BYTE, MAX_PAYLOAD_SIZE } from './constants';
import { Packet } from './types';

export class Protocol {
  /**
   * Calcula checksum XOR de um buffer.
   *
   * O checksum é calculado fazendo XOR de TODOS os bytes do buffer.
   * É simples, rápido, e detecta a maioria dos erros de transmissão.
   *
   * @param data - Buffer de bytes
   * @returns O byte resultante do XOR de todos os bytes
   *
   * @example
   * Protocol.checksum(Buffer.from([0xAA, 0x01, 0x00, 0x00])) // → 0xAB
   */
  static checksum(data: Buffer): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum ^= data[i];
    }
    // Garantir que o resultado é 1 byte (0-255)
    return sum & 0xff;
  }

  /**
   * Codifica um comando + payload em um pacote pronto para envio.
   *
   * @param cmd - Comando a enviar (ver enum Command)
   * @param payload - Dados do comando (opcional, padrão = vazio)
   * @returns Buffer com o pacote completo (start + cmd + length + payload + checksum)
   * @throws Error se o payload exceder MAX_PAYLOAD_SIZE (480 bytes)
   *
   * @example
   * // Pacote PING (sem payload)
   * Protocol.encode(Command.PING)
   * // → Buffer [0xAA, 0x01, 0x00, 0x00, 0xAB]
   *
   * @example
   * // Pacote SET_LED com payload [0x01] (ligar)
   * Protocol.encode(Command.SET_LED, Buffer.from([0x01]))
   * // → Buffer [0xAA, 0x10, 0x00, 0x01, 0x01, 0xBA]
   */
  static encode(cmd: Command, payload: Buffer = Buffer.alloc(0)): Buffer {
    const len = payload.length;

    if (len > MAX_PAYLOAD_SIZE) {
      throw new Error(
        `Payload too large: ${len} bytes (max: ${MAX_PAYLOAD_SIZE})`
      );
    }

    // Alocar buffer: start(1) + cmd(1) + length(2) + payload(N) + checksum(1)
    const packet = Buffer.alloc(4 + len + 1);

    // Montar header
    packet[0] = PROTO_START_BYTE; // START = 0xAA
    packet[1] = cmd;              // CMD
    packet[2] = (len >> 8) & 0xff; // LENGTH MSB (Big Endian)
    packet[3] = len & 0xff;        // LENGTH LSB

    // Copiar payload (se existir)
    if (len > 0) {
      payload.copy(packet, 4);
    }

    // Calcular e escrever checksum
    // O checksum é o XOR de TODOS os bytes ANTES dele (posições 0 até 3+len)
    packet[4 + len] = Protocol.checksum(packet.slice(0, 4 + len));

    return packet;
  }

  /**
   * Decodifica um buffer recebido em um pacote estruturado.
   *
   * Valida:
   * 1. Tamanho mínimo (5 bytes)
   * 2. Start byte (deve ser 0xAA)
   * 3. Coerência do campo length com o tamanho real
   * 4. Checksum
   *
   * @param data - Buffer de bytes recebidos via BLE notify
   * @returns Packet decodificado, ou null se inválido
   *
   * @example
   * const raw = Buffer.from([0xAA, 0x02, 0x00, 0x00, 0xA8]);
   * const packet = Protocol.decode(raw);
   * // → { cmd: Command.PONG, payload: Buffer [] }
   */
  static decode(data: Buffer): Packet | null {
    // Validação 1: Tamanho mínimo
    // Um pacote sem payload tem 5 bytes: start + cmd + length(2) + checksum
    if (data.length < 5) {
      console.warn(`[Protocol] Packet too short: ${data.length} bytes (min: 5)`);
      return null;
    }

    // Validação 2: Start byte
    if (data[0] !== PROTO_START_BYTE) {
      console.warn(
        `[Protocol] Invalid start byte: 0x${data[0].toString(16)} (expected 0xAA)`
      );
      return null;
    }

    // Extrair campos
    const cmd = data[1] as Command;
    const payloadLen = (data[2] << 8) | data[3]; // Big Endian

    // Validação 3: Tamanho total deve bater
    const expectedTotal = 4 + payloadLen + 1;
    if (data.length !== expectedTotal) {
      console.warn(
        `[Protocol] Size mismatch: got ${data.length}, expected ${expectedTotal}`
      );
      return null;
    }

    // Validação 4: Checksum
    const expectedChecksum = Protocol.checksum(data.slice(0, data.length - 1));
    const receivedChecksum = data[data.length - 1];
    if (expectedChecksum !== receivedChecksum) {
      console.warn(
        `[Protocol] Checksum failed: got 0x${receivedChecksum.toString(16)}, ` +
        `expected 0x${expectedChecksum.toString(16)}`
      );
      return null;
    }

    // Extrair payload
    const payload = Buffer.alloc(payloadLen);
    if (payloadLen > 0) {
      data.copy(payload, 0, 4, 4 + payloadLen);
    }

    return { cmd, payload };
  }

  /**
   * Formata um pacote para exibição em log (debug).
   *
   * @example
   * Protocol.formatForLog(packet)
   * // → "CMD=0x01(PING) LEN=0 PAYLOAD=[] CHK=0xAB"
   */
  static formatForLog(packet: Packet): string {
    const cmdName = Command[packet.cmd] || 'UNKNOWN';
    const payloadHex = [...packet.payload]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    return `CMD=0x${packet.cmd.toString(16).padStart(2, '0')}(${cmdName}) ` +
           `LEN=${packet.payload.length} ` +
           `PAYLOAD=[${payloadHex}]`;
  }
}
```

### 7.4. `src/ble/BleManager.ts`

```typescript
/**
 * BLE MANAGER — SINGLETON
 *
 * Este é o "coração" da comunicação BLE. É uma classe Singleton
 * (só existe uma instância) que gerencia todo o ciclo de vida:
 * - Permissões
 * - Scan
 * - Conexão/Desconexão
 * - Envio de dados (Write)
 * - Recebimento de dados (Notify)
 * - Reconexão automática
 *
 * COMO USAR:
 * import { bleManager } from './BleManager';
 * await bleManager.scan(onDeviceFound);
 * await bleManager.connect(device);
 * await bleManager.sendPacket(Command.PING);
 *
 * IMPORTANTE:
 * - Não crie múltiplas instâncias! Use o export `bleManager`.
 * - Todos os métodos são async (retornam Promise).
 * - Erros são throw, use try/catch.
 */

import {
  BleManager as PLXBleManager,
  Device,
  Subscription,
  BleError,
  State,
} from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { Platform, PermissionsAndroid } from 'react-native';
import {
  SERVICE_UUID,
  CHAR_RX_UUID,
  CHAR_TX_UUID,
  Command,
  ACK_TIMEOUT_MS,
  MAX_RETRIES,
  CONNECTION_TIMEOUT_MS,
  SCAN_DURATION_MS,
  REQUESTED_MTU,
  RECONNECT_INTERVAL_MS,
  MAX_RECONNECT_ATTEMPTS,
} from './constants';
import { Protocol } from './Protocol';
import {
  Packet,
  PacketListener,
  ConnectionListener,
  ConnectionState,
  ScannedDevice,
} from './types';

class BleManagerSingleton {
  // Instância da lib react-native-ble-plx
  private manager: PLXBleManager;

  // Dispositivo atualmente conectado (null = desconectado)
  private device: Device | null = null;

  // ID do dispositivo para reconexão
  private lastDeviceId: string | null = null;

  // Subscription do monitor de notificações
  private notifySubscription: Subscription | null = null;

  // Subscription do monitor de desconexão
  private disconnectSubscription: Subscription | null = null;

  // Listeners registrados para pacotes recebidos
  // Map: Command → array de callbacks
  private packetListeners: Map<number, PacketListener[]> = new Map();

  // Listeners de mudança de estado da conexão
  private connectionListeners: ConnectionListener[] = [];

  // Estado atual da conexão
  private _state: ConnectionState = ConnectionState.DISCONNECTED;

  // ACKs pendentes (esperando resposta)
  private pendingAcks: Map<
    number,
    { resolve: () => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }
  > = new Map();

  // Controle de reconexão
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldReconnect = false;

  // ============================================================
  // CONSTRUTOR
  // ============================================================

  constructor() {
    // Criar instância do BleManager da lib
    // restoreStateIdentifier permite restaurar conexões em background (iOS)
    this.manager = new PLXBleManager({
      restoreStateIdentifier: 'esp32-ble-app',
      restoreStateFunction: (restoredState) => {
        // Chamado no iOS quando o app é restaurado do background
        if (restoredState) {
          console.log('[BLE] State restored from background');
        }
      },
    });

    // Monitorar estado do Bluetooth do celular (ligado/desligado)
    this.manager.onStateChange((state) => {
      console.log(`[BLE] Bluetooth state: ${state}`);
      if (state === State.PoweredOff) {
        this.setState(ConnectionState.DISCONNECTED);
      }
    }, true);
  }

  // ============================================================
  // ESTADO
  // ============================================================

  /** Estado atual da conexão */
  get state(): ConnectionState {
    return this._state;
  }

  /** Se está conectado e pronto para comunicar */
  get isConnected(): boolean {
    return this._state === ConnectionState.CONNECTED;
  }

  private setState(newState: ConnectionState) {
    if (this._state !== newState) {
      console.log(`[BLE] State: ${this._state} → ${newState}`);
      this._state = newState;
      // Notificar todos os listeners
      this.connectionListeners.forEach((cb) => cb(newState));
    }
  }

  // ============================================================
  // PERMISSÕES
  // ============================================================

  /**
   * Solicita todas as permissões necessárias para BLE.
   *
   * QUANDO CHAMAR: Antes de qualquer operação BLE (scan, connect).
   * Idealmente na abertura da tela de scan.
   *
   * RETORNA: true se todas as permissões foram concedidas.
   *
   * NOTA iOS: No iOS, as permissões são gerenciadas automaticamente
   * pelo sistema com base no Info.plist. Esta função retorna true diretamente.
   *
   * NOTA Android: Abre o diálogo nativo de permissão. O usuário pode negar.
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      // iOS gerencia permissões via Info.plist
      // O sistema pede automaticamente na primeira vez que usamos BLE
      return true;
    }

    // Android
    const apiLevel = Platform.Version as number;

    if (apiLevel >= 31) {
      // Android 12+ (API 31+): precisa de BLUETOOTH_SCAN e BLUETOOTH_CONNECT
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const allGranted = Object.values(results).every(
        (r) => r === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        console.warn('[BLE] Permissions denied:', results);
      }

      return allGranted;
    } else {
      // Android 11 e inferior: só precisa de LOCATION
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
  }

  // ============================================================
  // SCAN
  // ============================================================

  /**
   * Escaneia por dispositivos BLE compatíveis.
   *
   * COMO FUNCIONA:
   * 1. Verifica se o Bluetooth está ligado
   * 2. Inicia scan filtrando pelo SERVICE_UUID
   * 3. Cada device encontrado chama o callback onDeviceFound
   * 4. Após SCAN_DURATION_MS, para automaticamente
   *
   * FILTRO POR UUID: Só encontra devices que anunciam nosso Service UUID.
   * Isso evita mostrar fones, relógios, etc.
   *
   * @param onDeviceFound - Callback chamado para cada device encontrado
   * @param durationMs - Duração do scan (padrão: 10 segundos)
   */
  async scan(
    onDeviceFound: (device: ScannedDevice) => void,
    durationMs: number = SCAN_DURATION_MS
  ): Promise<void> {
    // Verificar permissões
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Permissões BLE não concedidas pelo usuário');
    }

    // Verificar se Bluetooth está ligado
    const btState = await this.manager.state();
    if (btState !== State.PoweredOn) {
      throw new Error(
        `Bluetooth não está ligado (estado: ${btState}). ` +
        'Peça ao usuário para ligar o Bluetooth nas configurações.'
      );
    }

    this.setState(ConnectionState.SCANNING);

    // Set para evitar duplicatas
    const seen = new Set<string>();

    return new Promise((resolve, reject) => {
      // Timer para parar o scan após a duração
      const timeout = setTimeout(() => {
        this.stopScan();
        resolve();
      }, durationMs);

      // Iniciar scan
      this.manager.startDeviceScan(
        // Filtrar por Service UUID — só mostra nossos devices
        [SERVICE_UUID],
        // Opções
        { allowDuplicates: false },
        // Callback para cada device
        (error: BleError | null, device: Device | null) => {
          if (error) {
            console.error('[BLE] Scan error:', error.message);
            clearTimeout(timeout);
            this.setState(ConnectionState.DISCONNECTED);
            reject(new Error(`Scan failed: ${error.message}`));
            return;
          }

          if (device && device.id && !seen.has(device.id)) {
            seen.add(device.id);
            console.log(`[BLE] Found: ${device.name || 'Unknown'} (${device.id})`);
            onDeviceFound({
              id: device.id,
              name: device.name,
              rssi: device.rssi,
            });
          }
        }
      );
    });
  }

  /**
   * Para o scan imediatamente.
   * Chamar quando o usuário toca "Parar" ou sai da tela.
   */
  stopScan(): void {
    this.manager.stopDeviceScan();
    if (this._state === ConnectionState.SCANNING) {
      this.setState(ConnectionState.DISCONNECTED);
    }
  }

  // ============================================================
  // CONEXÃO
  // ============================================================

  /**
   * Conecta a um dispositivo BLE encontrado no scan.
   *
   * FLUXO INTERNO:
   * 1. Conecta ao device (TCP-like handshake BLE)
   * 2. Descobre services e characteristics
   * 3. Negocia MTU (Android)
   * 4. Assina notificações na characteristic TX
   * 5. Registra monitor de desconexão
   *
   * @param deviceId - ID do device (obtido do scan)
   * @throws Error se conexão falhar (timeout, device não encontrado, etc)
   */
  async connect(deviceId: string): Promise<void> {
    this.setState(ConnectionState.CONNECTING);
    this.shouldReconnect = true;

    try {
      // --- PASSO 1: Conectar ---
      console.log(`[BLE] Connecting to ${deviceId}...`);
      const connectedDevice = await this.manager.connectToDevice(deviceId, {
        timeout: CONNECTION_TIMEOUT_MS,
        requestMTU: REQUESTED_MTU, // Solicitar MTU grande
      });

      // --- PASSO 2: Descobrir services e characteristics ---
      // Isso é OBRIGATÓRIO antes de ler/escrever qualquer characteristic
      console.log('[BLE] Discovering services...');
      await connectedDevice.discoverAllServicesAndCharacteristics();

      // --- PASSO 3: Negociar MTU (Android) ---
      if (Platform.OS === 'android') {
        try {
          const mtu = await connectedDevice.requestMTU(REQUESTED_MTU);
          console.log(`[BLE] MTU negotiated: ${mtu} bytes`);
        } catch (e) {
          // Não é fatal — funciona com MTU menor, só mais lento
          console.warn('[BLE] MTU negotiation failed, using default');
        }
      }

      // --- PASSO 4: Assinar Notificações (TX) ---
      // Isso diz à ESP: "me avise quando tiver dados para enviar"
      console.log('[BLE] Subscribing to notifications...');
      this.notifySubscription = connectedDevice.monitorCharacteristicForService(
        SERVICE_UUID,
        CHAR_TX_UUID,
        (error, characteristic) => {
          if (error) {
            console.error('[BLE] Notify error:', error.message);
            // Erro no notify geralmente indica desconexão
            return;
          }
          if (characteristic?.value) {
            // Dados chegam em Base64 — converter para Buffer
            const data = Buffer.from(characteristic.value, 'base64');
            this.handleIncomingData(data);
          }
        }
      );

      // --- PASSO 5: Monitor de desconexão ---
      this.disconnectSubscription = this.manager.onDeviceDisconnected(
        deviceId,
        (error, device) => {
          console.log('[BLE] Disconnected!', error?.message || '');
          this.handleDisconnect();
        }
      );

      // Salvar estado
      this.device = connectedDevice;
      this.lastDeviceId = deviceId;
      this.reconnectAttempts = 0;
      this.setState(ConnectionState.CONNECTED);

      console.log('[BLE] ✅ Connected and ready!');
    } catch (error: any) {
      console.error('[BLE] Connection failed:', error.message);
      this.setState(ConnectionState.DISCONNECTED);
      throw new Error(`Falha na conexão: ${error.message}`);
    }
  }

  /**
   * Desconecta do dispositivo.
   * Também desabilita a reconexão automática.
   */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    this.stopReconnectTimer();

    // Cancelar subscriptions
    if (this.notifySubscription) {
      this.notifySubscription.remove();
      this.notifySubscription = null;
    }
    if (this.disconnectSubscription) {
      this.disconnectSubscription.remove();
      this.disconnectSubscription = null;
    }

    // Desconectar
    if (this.device) {
      try {
        await this.device.cancelConnection();
      } catch (e) {
        // Pode falhar se já estava desconectado — ignorar
      }
      this.device = null;
    }

    // Limpar ACKs pendentes
    this.pendingAcks.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Disconnected'));
    });
    this.pendingAcks.clear();

    this.setState(ConnectionState.DISCONNECTED);
    console.log('[BLE] Disconnected by user');
  }

  // ============================================================
  // ENVIAR DADOS
  // ============================================================

  /**
   * Envia um pacote para a ESP32.
   *
   * COMO FUNCIONA:
   * 1. Codifica o comando+payload no formato do protocolo
   * 2. Converte para Base64 (formato que a lib BLE aceita)
   * 3. Escreve na characteristic RX
   *
   * @param cmd - Comando a enviar
   * @param payload - Dados do comando (opcional)
   * @throws Error se não estiver conectado ou write falhar
   */
  async sendPacket(cmd: Command, payload: Buffer = Buffer.alloc(0)): Promise<void> {
    if (!this.device) {
      throw new Error('Não conectado. Conecte a um dispositivo primeiro.');
    }

    // Encode usando nosso protocolo
    const packet = Protocol.encode(cmd, payload);

    // Log para debug
    console.log(
      `[BLE] TX → CMD=0x${cmd.toString(16)} LEN=${payload.length} ` +
      `RAW=[${[...packet].map((b) => b.toString(16).padStart(2, '0')).join(' ')}]`
    );

    // Converter para Base64 (formato que react-native-ble-plx aceita)
    const base64Data = packet.toString('base64');

    // Escrever na characteristic RX (do ponto de vista da ESP)
    await this.device.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      CHAR_RX_UUID,
      base64Data
    );
  }

  /**
   * Envia um pacote e ESPERA pelo ACK.
   *
   * Se não receber ACK dentro de ACK_TIMEOUT_MS, tenta novamente
   * até MAX_RETRIES vezes.
   *
   * USE PARA: Comandos que modificam estado (SET_LED, DATA, OTA_*).
   * NÃO USE PARA: Comandos request/response (PING→PONG, GET_STATUS→STATUS_RESP).
   *
   * @param cmd - Comando a enviar
   * @param payload - Dados do comando (opcional)
   * @throws Error se todos os retries falharem
   */
  async sendWithAck(cmd: Command, payload: Buffer = Buffer.alloc(0)): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.sendPacket(cmd, payload);
        await this.waitForAck(cmd);
        return; // ACK recebido, sucesso!
      } catch (error: any) {
        console.warn(`[BLE] Attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Comando 0x${cmd.toString(16)} falhou após ${MAX_RETRIES} tentativas: ${error.message}`
          );
        }
        // Esperar um pouco antes de tentar de novo
        await this.sleep(500);
      }
    }
  }

  /**
   * Espera por um ACK específico.
   * Rejeita se receber NACK ou timeout.
   */
  private waitForAck(forCmd: Command): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(forCmd);
        reject(new Error(`ACK timeout para cmd 0x${forCmd.toString(16)}`));
      }, ACK_TIMEOUT_MS);

      this.pendingAcks.set(forCmd, { resolve, reject, timeout });
    });
  }

  // ============================================================
  // RECEBER DADOS
  // ============================================================

  /**
   * Processa dados recebidos via Notify.
   * Chamado internamente pelo monitorCharacteristic callback.
   */
  private handleIncomingData(data: Buffer): void {
    // Log raw para debug
    console.log(
      `[BLE] RX ← RAW=[${[...data].map((b) => b.toString(16).padStart(2, '0')).join(' ')}]`
    );

    // Decodificar pacote
    const packet = Protocol.decode(data);
    if (!packet) {
      console.warn('[BLE] Received invalid packet, ignoring');
      return;
    }

    console.log(`[BLE] RX ← ${Protocol.formatForLog(packet)}`);

    // Resolver ACK/NACK pendentes
    if (packet.cmd === Command.ACK && packet.payload.length >= 1) {
      const ackedCmd = packet.payload[0];
      const pending = this.pendingAcks.get(ackedCmd);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve();
        this.pendingAcks.delete(ackedCmd);
        console.log(`[BLE] ACK received for cmd 0x${ackedCmd.toString(16)}`);
      }
    }

    if (packet.cmd === Command.NACK && packet.payload.length >= 1) {
      const nackedCmd = packet.payload[0];
      const errorCode = packet.payload.length >= 2 ? packet.payload[1] : 0;
      const pending = this.pendingAcks.get(nackedCmd);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.reject(
          new Error(`NACK para cmd 0x${nackedCmd.toString(16)}, erro: 0x${errorCode.toString(16)}`)
        );
        this.pendingAcks.delete(nackedCmd);
      }
    }

    // Notificar listeners específicos do comando
    const cmdListeners = this.packetListeners.get(packet.cmd) || [];
    cmdListeners.forEach((cb) => cb(packet));

    // Notificar listeners "all" (registrados com -1)
    const allListeners = this.packetListeners.get(-1) || [];
    allListeners.forEach((cb) => cb(packet));
  }

  // ============================================================
  // LISTENERS
  // ============================================================

  /**
   * Registra um listener para pacotes de um comando específico.
   *
   * @param cmd - Comando para escutar, ou 'all' para todos
   * @param callback - Função chamada quando pacote é recebido
   * @returns Função de cleanup (chamar para remover o listener)
   *
   * @example
   * // Escutar só PONG
   * const unsub = bleManager.onPacket(Command.PONG, (packet) => {
   *   console.log('Pong received!');
   * });
   * // Quando não precisar mais:
   * unsub();
   *
   * @example
   * // Escutar todos os pacotes
   * const unsub = bleManager.onPacket('all', (packet) => {
   *   console.log('Packet:', packet.cmd);
   * });
   */
  onPacket(cmd: Command | 'all', callback: PacketListener): () => void {
    const key = cmd === 'all' ? -1 : cmd;

    if (!this.packetListeners.has(key)) {
      this.packetListeners.set(key, []);
    }
    this.packetListeners.get(key)!.push(callback);

    // Retornar função de unsubscribe
    return () => {
      const arr = this.packetListeners.get(key);
      if (arr) {
        const idx = arr.indexOf(callback);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  /**
   * Registra listener para mudanças de estado da conexão.
   *
   * @param callback - Função chamada quando o estado muda
   * @returns Função de cleanup
   *
   * @example
   * const unsub = bleManager.onConnectionChange((state) => {
   *   if (state === ConnectionState.CONNECTED) {
   *     console.log('Conectou!');
   *   }
   * });
   */
  onConnectionChange(callback: ConnectionListener): () => void {
    this.connectionListeners.push(callback);
    return () => {
      const idx = this.connectionListeners.indexOf(callback);
      if (idx >= 0) this.connectionListeners.splice(idx, 1);
    };
  }

  // ============================================================
  // HELPERS DE COMANDO
  // ============================================================

  /**
   * Envia PING e espera PONG.
   * Útil para testar se a conexão está viva.
   *
   * @returns true se recebeu PONG, false se timeout
   */
  async ping(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsub();
        resolve(false);
      }, 3000);

      const unsub = this.onPacket(Command.PONG, () => {
        clearTimeout(timeout);
        unsub();
        resolve(true);
      });

      this.sendPacket(Command.PING).catch(() => {
        clearTimeout(timeout);
        unsub();
        resolve(false);
      });
    });
  }

  /**
   * Liga ou desliga o LED da ESP32.
   *
   * @param on - true para ligar, false para desligar
   * @throws Error se o comando falhar (NACK ou timeout)
   */
  async setLed(on: boolean): Promise<void> {
    const payload = Buffer.from([on ? 1 : 0]);
    await this.sendWithAck(Command.SET_LED, payload);
  }

  /**
   * Solicita o status do dispositivo.
   *
   * @returns Status atual (state, error, battery)
   * @throws Error se timeout
   */
  async getStatus(): Promise<{state: number; error: number; battery: number}> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        unsub();
        reject(new Error('Status request timeout'));
      }, 3000);

      const unsub = this.onPacket(Command.STATUS_RESP, (packet) => {
        clearTimeout(timeout);
        unsub();
        if (packet.payload.length >= 3) {
          resolve({
            state: packet.payload[0],
            error: packet.payload[1],
            battery: packet.payload[2],
          });
        } else {
          reject(new Error('STATUS_RESP payload inválido'));
        }
      });

      try {
        await this.sendPacket(Command.GET_STATUS);
      } catch (e) {
        clearTimeout(timeout);
        unsub();
        reject(e);
      }
    });
  }

  /**
   * Envia dados genéricos para a ESP32.
   *
   * @param data - Buffer de dados (máx 480 bytes)
   */
  async sendData(data: Buffer): Promise<void> {
    await this.sendWithAck(Command.DATA, data);
  }

  // ============================================================
  // RECONEXÃO AUTOMÁTICA
  // ============================================================

  private handleDisconnect(): void {
    // Limpar estado
    this.device = null;
    this.notifySubscription?.remove();
    this.notifySubscription = null;

    // Limpar ACKs pendentes
    this.pendingAcks.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Disconnected'));
    });
    this.pendingAcks.clear();

    if (this.shouldReconnect && this.lastDeviceId) {
      // Tentar reconectar
      this.setState(ConnectionState.RECONNECTING);
      this.startReconnectTimer();
    } else {
      this.setState(ConnectionState.DISCONNECTED);
    }
  }

  private startReconnectTimer(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setInterval(async () => {
      if (!this.shouldReconnect || !this.lastDeviceId) {
        this.stopReconnectTimer();
        return;
      }

      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('[BLE] Max reconnect attempts reached');
        this.stopReconnectTimer();
        this.setState(ConnectionState.DISCONNECTED);
        return;
      }

      this.reconnectAttempts++;
      console.log(
        `[BLE] Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
      );

      try {
        await this.connect(this.lastDeviceId!);
        this.stopReconnectTimer();
      } catch (e) {
        console.log('[BLE] Reconnect failed, will retry...');
      }
    }, RECONNECT_INTERVAL_MS);
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ============================================================
  // UTILIDADES
  // ============================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Destroi o manager BLE.
   * Chamar APENAS quando o app está sendo fechado.
   */
  destroy(): void {
    this.disconnect();
    this.manager.destroy();
  }
}

// ============================================================
// EXPORTAR SINGLETON
// Use esta instância em todo o app. NÃO crie new BleManagerSingleton().
// ============================================================
export const bleManager = new BleManagerSingleton();
```

### 7.5. `src/hooks/useBle.ts`

```typescript
/**
 * HOOK: useBle
 *
 * Hook React que expõe funcionalidades de scan e conexão BLE
 * para componentes React Native.
 *
 * COMO USAR:
 * const { scan, connect, disconnect, devices, state } = useBle();
 */

import { useState, useEffect, useCallback } from 'react';
import { bleManager } from '../ble/BleManager';
import { ConnectionState, ScannedDevice } from '../ble/types';

export function useBle() {
  // Lista de devices encontrados no scan
  const [devices, setDevices] = useState<ScannedDevice[]>([]);

  // Estado da conexão
  const [state, setState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);

  // ID do device conectado
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);

  // Registrar listener de estado
  useEffect(() => {
    const unsub = bleManager.onConnectionChange((newState) => {
      setState(newState);
      if (newState === ConnectionState.DISCONNECTED) {
        setConnectedDeviceId(null);
      }
    });
    return unsub;
  }, []);

  /**
   * Inicia scan por dispositivos BLE.
   * Os devices encontrados são adicionados ao array `devices`.
   */
  const scan = useCallback(async () => {
    setDevices([]); // Limpar lista anterior

    await bleManager.scan((device) => {
      setDevices((prev) => {
        // Evitar duplicatas
        if (prev.find((d) => d.id === device.id)) return prev;
        return [...prev, device];
      });
    });
  }, []);

  /** Para o scan */
  const stopScan = useCallback(() => {
    bleManager.stopScan();
  }, []);

  /** Conecta a um device */
  const connect = useCallback(async (deviceId: string) => {
    await bleManager.connect(deviceId);
    setConnectedDeviceId(deviceId);
  }, []);

  /** Desconecta */
  const disconnect = useCallback(async () => {
    await bleManager.disconnect();
  }, []);

  return {
    // Estado
    state,
    isConnected: state === ConnectionState.CONNECTED,
    isScanning: state === ConnectionState.SCANNING,
    connectedDeviceId,

    // Dados
    devices,

    // Ações
    scan,
    stopScan,
    connect,
    disconnect,
  };
}
```

### 7.6. `src/hooks/useDevice.ts`

```typescript
/**
 * HOOK: useDevice
 *
 * Hook React para comunicação com o device conectado.
 * Fornece funções de alto nível (ping, setLed, getStatus)
 * e acesso aos pacotes recebidos.
 *
 * COMO USAR:
 * const { ping, setLed, getStatus, status, lastPacket } = useDevice();
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { bleManager } from '../ble/BleManager';
import { Command } from '../ble/constants';
import { Packet, DeviceStatus } from '../ble/types';
import { Protocol } from '../ble/Protocol';

/** Entrada no log de pacotes */
export interface PacketLogEntry {
  timestamp: Date;
  direction: 'TX' | 'RX';
  packet: Packet;
  formatted: string;
}

export function useDevice() {
  // Status do dispositivo
  const [status, setStatus] = useState<DeviceStatus | null>(null);

  // Estado do LED
  const [ledState, setLedState] = useState(false);

  // Último pacote recebido
  const [lastPacket, setLastPacket] = useState<Packet | null>(null);

  // Log de pacotes (útil para debug)
  const [packetLog, setPacketLog] = useState<PacketLogEntry[]>([]);

  // Loading states
  const [isPinging, setIsPinging] = useState(false);
  const [isTogglingLed, setIsTogglingLed] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // Escutar todos os pacotes recebidos
  useEffect(() => {
    const unsub = bleManager.onPacket('all', (packet) => {
      setLastPacket(packet);

      // Adicionar ao log
      setPacketLog((prev) => [
        {
          timestamp: new Date(),
          direction: 'RX',
          packet,
          formatted: Protocol.formatForLog(packet),
        },
        ...prev.slice(0, 99), // Manter últimos 100
      ]);
    });
    return unsub;
  }, []);

  /**
   * Envia PING e verifica se recebe PONG.
   * @returns true se a ESP respondeu
   */
  const ping = useCallback(async (): Promise<boolean> => {
    setIsPinging(true);
    try {
      const result = await bleManager.ping();
      return result;
    } finally {
      setIsPinging(false);
    }
  }, []);

  /**
   * Liga ou desliga o LED.
   */
  const toggleLed = useCallback(async () => {
    setIsTogglingLed(true);
    try {
      const newState = !ledState;
      await bleManager.setLed(newState);
      setLedState(newState);
    } finally {
      setIsTogglingLed(false);
    }
  }, [ledState]);

  /**
   * Busca o status atual do dispositivo.
   */
  const refreshStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const s = await bleManager.getStatus();
      setStatus(s);
      return s;
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  /** Limpa o log de pacotes */
  const clearLog = useCallback(() => {
    setPacketLog([]);
  }, []);

  return {
    // Estado
    status,
    ledState,
    lastPacket,
    packetLog,

    // Loading
    isPinging,
    isTogglingLed,
    isLoadingStatus,

    // Ações
    ping,
    toggleLed,
    refreshStatus,
    clearLog,
  };
}
```

---

## 8. Protocolo de Comunicação

### 8.1. Formato do Pacote (repetido aqui para referência rápida)

```
┌───────────┬─────────┬──────────────┬─────────────────┬───────────┐
│  START    │   CMD   │   LENGTH     │    PAYLOAD      │  CHECKSUM │
│  0xAA     │  1 byte │  2 bytes BE  │  0-480 bytes    │  XOR      │
└───────────┴─────────┴──────────────┴─────────────────┴───────────┘
```

### 8.2. Comandos Disponíveis

| Código | Nome | Quem envia | Payload | Espera resposta? |
|--------|------|-----------|---------|-----------------|
| `0x01` | PING | App | — | Sim → PONG |
| `0x02` | PONG | ESP | — | Não |
| `0x10` | SET_LED | App | `[0/1]` | Sim → ACK |
| `0x20` | GET_STATUS | App | — | Sim → STATUS_RESP |
| `0x21` | STATUS_RESP | ESP | `[state, error, battery]` | Não |
| `0x30` | DATA | Ambos | N bytes | Sim → ACK |
| `0xFE` | ACK | Ambos | `[cmd_confirmado]` | Não |
| `0xFF` | NACK | Ambos | `[cmd_rejeitado, erro]` | Não |

### 8.3. Exemplos de Uso no Código

```typescript
// PING → espera PONG
const alive = await bleManager.ping();
// Internamente: envia [AA 01 00 00 AB], espera [AA 02 00 00 A8]

// Ligar LED → espera ACK
await bleManager.setLed(true);
// Internamente: envia [AA 10 00 01 01 BA], espera [AA FE 00 01 10 ...]

// Get Status → espera STATUS_RESP
const status = await bleManager.getStatus();
// Internamente: envia [AA 20 00 00 8A], espera [AA 21 00 03 XX XX XX YY]
// status = { state: XX, error: XX, battery: XX }
```

### 8.4. Encoding Base64

A lib `react-native-ble-plx` envia e recebe dados em **Base64**. Nosso BleManager faz a conversão automaticamente:

```
Envio: Buffer → Base64 string → writeCharacteristic
Recebimento: characteristic.value (Base64) → Buffer → Protocol.decode
```

Você NÃO precisa se preocupar com Base64 ao usar os hooks — é transparente.

---

## 9. Telas do App

### 9.1. `src/screens/ScanScreen.tsx`

```tsx
/**
 * TELA DE SCAN
 *
 * Funcionalidades:
 * - Botão para iniciar/parar scan
 * - Lista de dispositivos encontrados
 * - Toque em um device para conectar
 * - Indicador de loading durante scan/connect
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useBle } from '../hooks/useBle';
import { ConnectionState, ScannedDevice } from '../ble/types';

export function ScanScreen({ navigation }: any) {
  const { state, devices, scan, stopScan, connect } = useBle();
  const [connectingTo, setConnectingTo] = useState<string | null>(null);

  const isScanning = state === ConnectionState.SCANNING;

  const handleScan = async () => {
    try {
      await scan();
    } catch (error: any) {
      Alert.alert('Erro no Scan', error.message);
    }
  };

  const handleConnect = async (device: ScannedDevice) => {
    setConnectingTo(device.id);
    try {
      await connect(device.id);
      navigation.navigate('Device', { deviceName: device.name });
    } catch (error: any) {
      Alert.alert('Erro na Conexão', error.message);
    } finally {
      setConnectingTo(null);
    }
  };

  const renderDevice = ({ item }: { item: ScannedDevice }) => {
    const isConnecting = connectingTo === item.id;

    return (
      <TouchableOpacity
        style={styles.deviceCard}
        onPress={() => handleConnect(item)}
        disabled={isConnecting}
      >
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>
            {item.name || 'Dispositivo sem nome'}
          </Text>
          <Text style={styles.deviceId}>{item.id}</Text>
          <Text style={styles.deviceRssi}>
            Sinal: {item.rssi} dBm
            {item.rssi && item.rssi > -60 ? ' 📶 Forte' :
             item.rssi && item.rssi > -80 ? ' 📶 Médio' : ' 📶 Fraco'}
          </Text>
        </View>
        {isConnecting && <ActivityIndicator size="small" color="#007AFF" />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Dispositivos BLE</Text>
        <Text style={styles.subtitle}>
          {isScanning
            ? 'Procurando dispositivos...'
            : `${devices.length} encontrado(s)`}
        </Text>
      </View>

      {/* Botão de Scan */}
      <TouchableOpacity
        style={[styles.scanButton, isScanning && styles.scanButtonActive]}
        onPress={isScanning ? stopScan : handleScan}
      >
        {isScanning && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />}
        <Text style={styles.scanButtonText}>
          {isScanning ? 'Parar Scan' : 'Escanear'}
        </Text>
      </TouchableOpacity>

      {/* Lista de Devices */}
      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={renderDevice}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !isScanning ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                Nenhum dispositivo encontrado.{'\n'}
                Verifique se a ESP32 está ligada e próxima.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  header: { padding: 20, paddingBottom: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  scanButton: {
    backgroundColor: '#007AFF',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonActive: { backgroundColor: '#FF3B30' },
  scanButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  list: { padding: 20, paddingTop: 12 },
  deviceCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  deviceId: { fontSize: 12, color: '#999', marginTop: 2 },
  deviceRssi: { fontSize: 12, color: '#666', marginTop: 4 },
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: '#999', textAlign: 'center', lineHeight: 22 },
});
```

### 9.2. `src/screens/DeviceScreen.tsx`

```tsx
/**
 * TELA DO DISPOSITIVO CONECTADO
 *
 * Funcionalidades:
 * - Status da conexão
 * - Ping (teste)
 * - Ligar/desligar LED
 * - Ver status do device
 * - Log de pacotes
 * - Desconectar
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { useBle } from '../hooks/useBle';
import { useDevice } from '../hooks/useDevice';
import { ConnectionState } from '../ble/types';

export function DeviceScreen({ navigation, route }: any) {
  const { state, disconnect } = useBle();
  const {
    status,
    ledState,
    packetLog,
    isPinging,
    isTogglingLed,
    isLoadingStatus,
    ping,
    toggleLed,
    refreshStatus,
    clearLog,
  } = useDevice();

  const [pingResult, setPingResult] = useState<string>('');
  const deviceName = route?.params?.deviceName || 'ESP32';

  // Voltar se desconectar
  useEffect(() => {
    if (state === ConnectionState.DISCONNECTED) {
      navigation.goBack();
    }
  }, [state]);

  // Buscar status ao entrar na tela
  useEffect(() => {
    refreshStatus().catch(() => {});
  }, []);

  const handlePing = async () => {
    const result = await ping();
    setPingResult(result ? '✅ Pong!' : '❌ Timeout');
    setTimeout(() => setPingResult(''), 3000);
  };

  const handleDisconnect = () => {
    Alert.alert('Desconectar', 'Deseja desconectar do dispositivo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desconectar', style: 'destructive', onPress: disconnect },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Connection Status */}
      <View style={styles.statusBar}>
        <View style={[styles.statusDot,
          state === ConnectionState.CONNECTED && styles.statusDotConnected,
          state === ConnectionState.RECONNECTING && styles.statusDotReconnecting,
        ]} />
        <Text style={styles.statusText}>
          {state === ConnectionState.CONNECTED ? `Conectado a ${deviceName}` :
           state === ConnectionState.RECONNECTING ? 'Reconectando...' : 'Desconectado'}
        </Text>
      </View>

      {/* Device Status Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 Status do Dispositivo</Text>
        {status ? (
          <View style={styles.statusGrid}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Estado</Text>
              <Text style={styles.statusValue}>
                {status.state === 1 ? '🟢 Rodando' : '🔴 Parado'}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Bateria</Text>
              <Text style={styles.statusValue}>{status.battery}% 🔋</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Erro</Text>
              <Text style={styles.statusValue}>
                {status.error === 0 ? '✅ Nenhum' : `⚠️ Código ${status.error}`}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.muted}>Carregando...</Text>
        )}
        <TouchableOpacity
          style={styles.smallButton}
          onPress={refreshStatus}
          disabled={isLoadingStatus}
        >
          <Text style={styles.smallButtonText}>
            {isLoadingStatus ? 'Atualizando...' : '🔄 Atualizar'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Controls Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎮 Controles</Text>

        {/* Ping */}
        <TouchableOpacity
          style={styles.button}
          onPress={handlePing}
          disabled={isPinging}
        >
          <Text style={styles.buttonText}>
            {isPinging ? '⏳ Pingando...' : '🏓 Ping'}
          </Text>
        </TouchableOpacity>
        {pingResult ? <Text style={styles.result}>{pingResult}</Text> : null}

        {/* LED */}
        <TouchableOpacity
          style={[styles.button, ledState && styles.buttonActive]}
          onPress={toggleLed}
          disabled={isTogglingLed}
        >
          <Text style={styles.buttonText}>
            {isTogglingLed ? '⏳...' : `💡 LED: ${ledState ? 'ON' : 'OFF'}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Packet Log */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>📋 Log de Pacotes</Text>
          <TouchableOpacity onPress={clearLog}>
            <Text style={styles.clearText}>Limpar</Text>
          </TouchableOpacity>
        </View>
        {packetLog.length === 0 ? (
          <Text style={styles.muted}>Nenhum pacote ainda...</Text>
        ) : (
          packetLog.slice(0, 20).map((entry, i) => (
            <View key={i} style={styles.logEntry}>
              <Text style={styles.logTime}>
                {entry.timestamp.toLocaleTimeString()}
              </Text>
              <Text style={[styles.logDirection,
                entry.direction === 'TX' ? styles.logTx : styles.logRx
              ]}>
                {entry.direction}
              </Text>
              <Text style={styles.logContent} numberOfLines={1}>
                {entry.formatted}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Disconnect */}
      <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
        <Text style={styles.disconnectText}>🔌 Desconectar</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  statusBar: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff' },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ccc', marginRight: 8 },
  statusDotConnected: { backgroundColor: '#34C759' },
  statusDotReconnecting: { backgroundColor: '#FF9500' },
  statusText: { fontSize: 14, fontWeight: '500' },
  card: { backgroundColor: '#fff', margin: 16, marginBottom: 0, padding: 16, borderRadius: 12, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusGrid: { gap: 8 },
  statusItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  statusLabel: { fontSize: 14, color: '#666' },
  statusValue: { fontSize: 14, fontWeight: '600' },
  button: { backgroundColor: '#007AFF', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  buttonActive: { backgroundColor: '#34C759' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  smallButton: { backgroundColor: '#f0f0f0', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  smallButtonText: { color: '#007AFF', fontWeight: '600' },
  result: { textAlign: 'center', marginTop: 6, fontSize: 14 },
  muted: { color: '#999', fontStyle: 'italic' },
  clearText: { color: '#FF3B30', fontWeight: '600' },
  logEntry: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  logTime: { fontSize: 10, color: '#999', width: 70 },
  logDirection: { fontSize: 11, fontWeight: '700', width: 24, textAlign: 'center' },
  logTx: { color: '#007AFF' },
  logRx: { color: '#34C759' },
  logContent: { fontSize: 11, color: '#333', flex: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  disconnectButton: { backgroundColor: '#FF3B30', margin: 16, padding: 16, borderRadius: 12, alignItems: 'center' },
  disconnectText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

---

## 10. Reconexão Automática

### Como funciona

A reconexão automática é gerenciada pelo `BleManager`:

1. Quando o device desconecta inesperadamente, o `onDeviceDisconnected` dispara
2. Se `shouldReconnect` é true (definido no `connect()`), inicia timer de reconexão
3. A cada `RECONNECT_INTERVAL_MS` (3s), tenta reconectar
4. Máximo de `MAX_RECONNECT_ATTEMPTS` (5) tentativas
5. Se reconectar com sucesso, volta ao estado CONNECTED
6. Se esgotar tentativas, vai para DISCONNECTED

### Quando a reconexão é ativada

- **Ativada:** Após um `connect()` bem-sucedido
- **Desativada:** Quando o USUÁRIO chama `disconnect()` (desconexão intencional)

### Na UI

O estado `RECONNECTING` deve ser mostrado na tela:
- Indicador visual (dot amarelo, texto "Reconectando...")
- O usuário pode cancelar chamando `disconnect()`

---

## 11. Testes e Debug

### 11.1. Testar sem a ESP (Simulador BLE)

Você pode usar estes apps para simular um peripheral BLE:

- **LightBlue** (iOS) — Simula GATT server
- **BLE Peripheral Simulator** (Android)

Configure o simulador com os mesmos UUIDs do projeto.

### 11.2. Testar com a ESP via nRF Connect

1. Conecte o celular à ESP com **nRF Connect** (app separado)
2. Verifique que os services/characteristics aparecem corretamente
3. Teste Write e Notify manualmente
4. Depois teste com o seu app

### 11.3. Debug de pacotes

O hook `useDevice` expõe `packetLog` — um array de todos os pacotes enviados/recebidos. Mostre numa tela de debug durante o desenvolvimento.

### 11.4. Console logs

Todos os logs do BleManager usam prefixo `[BLE]`:
```
[BLE] State: disconnected → scanning
[BLE] Found: ESP32S3-Device (AA:BB:CC:DD:EE:FF)
[BLE] State: scanning → connecting
[BLE] MTU negotiated: 512 bytes
[BLE] Subscribing to notifications...
[BLE] State: connecting → connected
[BLE] TX → CMD=0x01 LEN=0 RAW=[aa 01 00 00 ab]
[BLE] RX ← RAW=[aa 02 00 00 a8]
[BLE] RX ← CMD=0x02(PONG) LEN=0 PAYLOAD=[]
```

Use **Flipper** ou **React Native Debugger** para ver estes logs no console.

---

## 12. Problemas Comuns e Soluções

### "Scan não encontra nenhum dispositivo"

| Causa | Solução |
|-------|---------|
| Bluetooth desligado | Verificar `manager.state()` antes do scan |
| Permissões negadas | Chamar `requestPermissions()` e verificar retorno |
| ESP não está advertising | Verificar logs da ESP (Monitor Serial) |
| Filtro de UUID errado | Temporariamente remover filtro: `startDeviceScan(null, ...)` |
| Distância grande | Aproximar dispositivos (~2m para teste) |
| Android com Location desligada | Pedir para o user ligar GPS (bizarro mas necessário) |

### "Conecta mas desconecta imediatamente"

| Causa | Solução |
|-------|---------|
| MTU negotiation crash | Colocar try/catch no requestMTU |
| discoverServices timeout | Aumentar timeout da conexão |
| ESP recusou a conexão | Verificar logs da ESP |
| Problema de bonding | Esquecer device no Bluetooth do celular e tentar de novo |

### "Write falha com erro 'not connected'"

| Causa | Solução |
|-------|---------|
| Device desconectou entre check e write | Sempre usar try/catch |
| Services não descobertos | Garantir que `discoverAll...` completou |
| Characteristic UUID errado | Verificar UUIDs (case-insensitive, com hifens) |

### "Notify não recebe dados"

| Causa | Solução |
|-------|---------|
| Não fez subscribe | Verificar que `monitorCharacteristic` foi chamado |
| ESP não habilitou notify | Verificar flag `notifications_enabled` na ESP |
| MTU muito pequeno | Pacote pode estar sendo descartado |
| Base64 decode errado | Verificar que está usando `Buffer.from(value, 'base64')` |

### "Dados corrompidos / Checksum falha"

| Causa | Solução |
|-------|---------|
| Encoding errado | Verificar Big Endian no length |
| Pacote fragmentado pelo BLE | Implementar reassembly (ver protocolo avançado) |
| UUID trocado (lendo de outro char) | Verificar que subscribe é no TX, write é no RX |

### "App trava / Crash"

| Causa | Solução |
|-------|---------|
| BleManager usado antes de pronto | Verificar state === PoweredOn antes de usar |
| Múltiplas instâncias | Usar SEMPRE o singleton `bleManager` |
| Callback chamado após unmount | Retornar cleanup nos useEffect |
| Memory leak nas subscriptions | Guardar ref e chamar `.remove()` no cleanup |

---

## 13. Background Mode

### iOS

Com `bluetooth-central` no `UIBackgroundModes` (já configurado no Info.plist):
- App continua recebendo dados BLE em background
- Pode reconectar automaticamente
- Apple pode encerrar se consumir muita memória

### Android

Android é mais restritivo. Para manter conexão BLE em background:

1. **Foreground Service** (recomendado):
```java
// Criar um Foreground Service que mantém a conexão
// Mostra uma notificação persistente ao usuário
```

2. **WorkManager** (para operações periódicas):
```java
// Agenda reconexões periódicas
```

> ⚠️ Implementar background no Android é complexo e depende do caso de uso. Para MVP, funcionar apenas em foreground é aceitável.

---

## 14. Checklist de Entrega

Antes de considerar o app "pronto para integração com o firmware":

### Funcional
- [ ] Permissões solicitadas corretamente (Android 12+ e inferior)
- [ ] Scan encontra a ESP32 pelo Service UUID
- [ ] Conexão completa em < 5 segundos
- [ ] MTU negociado > 200 bytes (verificar log)
- [ ] Subscribe no TX funciona (verificar log "Notifications enabled")
- [ ] PING → PONG funciona
- [ ] SET_LED → ACK funciona
- [ ] GET_STATUS → STATUS_RESP funciona
- [ ] Dados inválidos resultam em NACK (testar enviando payload errado)
- [ ] Desconexão do lado do app funciona limpa
- [ ] Reconexão automática funciona quando ESP reinicia

### UX
- [ ] Loading states em todas as ações (scan, connect, send)
- [ ] Mensagens de erro claras para o usuário
- [ ] Estado de conexão visível (badge/dot)
- [ ] Não permite ações quando desconectado
- [ ] Log de pacotes acessível para debug

### Código
- [ ] Zero warnings no build
- [ ] TypeScript sem `any` desnecessários
- [ ] Todos os useEffect com cleanup
- [ ] Singleton BleManager (não múltiplas instâncias)
- [ ] Logs com prefixo `[BLE]` para facilitar filtro

---

## Referências

- [react-native-ble-plx Docs](https://github.com/dotintent/react-native-ble-plx)
- [react-native-ble-plx Wiki](https://github.com/dotintent/react-native-ble-plx/wiki)
- [BLE no Android (Google Docs)](https://developer.android.com/guide/topics/connectivity/bluetooth-le)
- [CoreBluetooth (Apple Docs)](https://developer.apple.com/documentation/corebluetooth)
- [Buffer (npm)](https://www.npmjs.com/package/buffer)
