# Requirements Document

## Introduction

Este documento especifica os requisitos para o app React Native (Expo SDK 54) que se conecta ao **Controlador MIDI BLE** (ESP32-S3) via Bluetooth Low Energy. O app permite ao usuário visualizar e controlar remotamente os 2048 parâmetros CC MIDI (16 canais × 128 controllers) usando a API GATT documentada em `doc/BLE_CLIENT_API.md`. O protocolo utiliza mensagens binárias de 3 bytes no formato `[channel, controller_number, cc_value]`.

## Glossary

- **App**: Aplicação React Native construída com Expo SDK 54 e expo-router, executada em dispositivo Android ou iOS
- **Controlador**: Dispositivo ESP32-S3 que expõe um servidor BLE GATT com o nome "Controlador MIDI BLE"
- **BLE_Manager**: Módulo do App responsável por gerenciar scan, conexão e operações BLE usando a biblioteca react-native-ble-plx
- **CC_Store**: Estrutura de dados local no App que armazena os valores CC de todos os 16 canais (16 × 128 = 2048 valores)
- **Protocolo_CC**: Formato binário de 3 bytes [channel (1–16), controller_number (0–127), cc_value (0–127)] usado em todas as operações BLE
- **Validador**: Módulo do App responsável por validar mensagens CC antes do envio
- **UI_Controller**: Componentes visuais do App (sliders, knobs, seletores) que permitem interação do usuário
- **Notificação_CC**: Mensagem de 3 bytes recebida via BLE Notify na characteristic ff01 quando um CC muda no Controlador
- **Bulk_Read**: Operação de leitura de 128 bytes na characteristic ff02 que retorna todos os valores CC de um canal
- **Sync_Completo**: Processo de executar Bulk_Read sequencialmente para todos os 16 canais
- **SERVICE_UUID**: `0000ff00-0000-1000-8000-00805f9b34fb`
- **CC_CHAR_UUID**: `0000ff01-0000-1000-8000-00805f9b34fb`
- **BULK_CHAR_UUID**: `0000ff02-0000-1000-8000-00805f9b34fb`

## Requirements

### Requirement 1: Scan e Descoberta BLE

**User Story:** Como usuário, eu quero que o App encontre automaticamente o Controlador MIDI BLE nas proximidades, para que eu possa conectar sem configuração manual.

#### Acceptance Criteria

1. WHEN o usuário inicia o scan, THE BLE_Manager SHALL buscar dispositivos BLE filtrando pelo SERVICE_UUID `0000ff00-0000-1000-8000-00805f9b34fb`
2. WHEN um dispositivo com o nome "Controlador MIDI BLE" é encontrado durante o scan, THE BLE_Manager SHALL parar o scan e apresentar o dispositivo encontrado na UI com opção para o usuário iniciar a conexão
3. WHEN o scan não encontra o Controlador em 10 segundos, THE BLE_Manager SHALL parar o scan e exibir uma mensagem indicando que nenhum dispositivo foi encontrado, com opção de repetir o scan
4. WHEN o App inicia o scan, THE UI_Controller SHALL exibir um indicador visual de que o scan está em andamento
5. IF as permissões de Bluetooth (BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION) não estiverem concedidas quando o usuário inicia o scan, THEN THE App SHALL solicitar as permissões ao usuário antes de iniciar o scan e, caso o usuário negue, exibir uma mensagem indicando que as permissões são necessárias para encontrar o dispositivo
6. IF o adaptador Bluetooth do dispositivo estiver desativado quando o usuário inicia o scan, THEN THE App SHALL exibir uma mensagem informando que o Bluetooth precisa ser ativado e não iniciar o scan
7. IF ocorrer um erro durante o scan BLE, THEN THE BLE_Manager SHALL parar o scan e exibir uma mensagem indicando a falha, com opção de repetir o scan

### Requirement 2: Conexão BLE

**User Story:** Como usuário, eu quero que o App se conecte ao Controlador de forma confiável, para que eu possa controlar os parâmetros MIDI remotamente.

#### Acceptance Criteria

1. WHEN o usuário seleciona o Controlador para conexão, THE BLE_Manager SHALL iniciar a conexão ao dispositivo solicitando MTU de 185 bytes com um timeout de 10 segundos
2. WHEN a conexão BLE é estabelecida, THE BLE_Manager SHALL descobrir todos os serviços e characteristics do Controlador dentro de 5 segundos
3. WHEN a descoberta de serviços é concluída e a characteristic CC_CHAR_UUID (0000ff01) é encontrada, THE BLE_Manager SHALL habilitar notificações na characteristic CC_CHAR_UUID
4. IF a conexão falha porque outro dispositivo já está conectado ao Controlador, THEN THE App SHALL exibir a mensagem "Outro dispositivo já está conectado ao controlador"
5. IF a conexão falha por timeout ou erro de comunicação, THEN THE App SHALL exibir uma mensagem de erro indicando o motivo da falha (timeout, dispositivo fora de alcance, ou erro do sistema operacional)
6. IF a descoberta de serviços falha ou a characteristic CC_CHAR_UUID não é encontrada, THEN THE BLE_Manager SHALL desconectar do dispositivo e THE App SHALL exibir uma mensagem de erro indicando que o dispositivo não é compatível

### Requirement 3: Sincronização Inicial

**User Story:** Como usuário, eu quero que o App carregue todos os valores CC atuais ao conectar, para que eu veja o estado real do Controlador imediatamente.

#### Acceptance Criteria

1. WHEN a conexão e habilitação de notificações são concluídas, THE BLE_Manager SHALL executar Sync_Completo lendo sequencialmente os 128 CCs de cada um dos 16 canais (canal 1 ao 16) via Bulk_Read na BULK_CHAR_UUID, aguardando no máximo 5 segundos por canal antes de considerar timeout
2. WHEN o Bulk_Read de um canal é concluído com 128 bytes, THE CC_Store SHALL armazenar os 128 valores retornados para o canal correspondente, substituindo quaisquer valores anteriores
3. WHILE o Sync_Completo está em andamento, THE UI_Controller SHALL exibir o progresso da sincronização indicando o canal sendo lido e o total (ex: canal atual / 16)
4. IF o Bulk_Read de um canal retorna resposta vazia ou excede o timeout de 5 segundos, THEN THE App SHALL registrar o erro em log interno, manter os valores do canal afetado em 0 no CC_Store, e continuar a sincronização dos canais restantes
5. WHEN o Sync_Completo finaliza (todos os 16 canais lidos ou tratados por erro), THE UI_Controller SHALL remover o indicador de progresso e exibir a tela principal com os valores carregados
6. IF a conexão BLE é perdida durante o Sync_Completo, THEN THE App SHALL abortar a sincronização, descartar valores parciais não confirmados, e iniciar o fluxo de reconexão

### Requirement 4: Recebimento de Notificações CC em Tempo Real

**User Story:** Como usuário, eu quero ver mudanças de CC em tempo real quando alguém mexe nos potenciômetros do Controlador, para que a interface reflita o estado atual.

#### Acceptance Criteria

1. WHEN uma Notificação_CC é recebida na characteristic CC_CHAR_UUID (0000ff01), THE App SHALL decodificar os 3 bytes no formato Protocolo_CC (byte 0: canal 1–16, byte 1: controller 0–127, byte 2: valor 0–127)
2. WHEN uma Notificação_CC válida é decodificada, THE CC_Store SHALL atualizar o valor do controller correspondente no canal correspondente, sobrescrevendo o valor anterior
3. WHEN o CC_Store é atualizado por uma notificação, THE UI_Controller SHALL refletir o novo valor no componente visual correspondente (slider ou knob) em no máximo 100ms após a atualização do store
4. IF uma Notificação_CC contém dados inválidos (menos de 3 bytes, canal fora de 1–16, controller acima de 127, ou valor acima de 127), THEN THE App SHALL descartar a notificação sem atualizar o CC_Store e sem exibir erro ao usuário
5. IF múltiplas Notificações_CC chegam em sequência rápida para o mesmo canal e controller, THEN THE CC_Store SHALL aplicar cada atualização na ordem de recebimento, e a UI SHALL exibir ao menos o valor final mais recente
6. IF o monitor de notificações na characteristic CC_CHAR_UUID reportar um erro BLE, THEN THE App SHALL manter o último estado conhecido no CC_Store sem corrompê-lo e SHALL registrar o erro internamente para diagnóstico

### Requirement 5: Envio Remoto de CC (Write)

**User Story:** Como usuário, eu quero enviar valores CC para o Controlador através da interface do App, para que eu possa controlar parâmetros MIDI remotamente.

#### Acceptance Criteria

1. WHEN o usuário ajusta um slider ou knob na UI_Controller, THE App SHALL codificar a mensagem no formato Protocolo_CC (3 bytes: channel, controller_number, cc_value) e enviar via writeCharacteristicWithResponse na CC_CHAR_UUID
2. WHEN o usuário ajusta um slider ou knob na UI_Controller, THE CC_Store SHALL atualizar o valor local imediatamente antes da confirmação do write BLE (atualização otimista)
3. THE Validador SHALL rejeitar qualquer mensagem CC onde o canal esteja fora do intervalo 1–16, impedindo o envio e mantendo o valor anterior no CC_Store
4. THE Validador SHALL rejeitar qualquer mensagem CC onde o controller_number esteja fora do intervalo 0–127, impedindo o envio e mantendo o valor anterior no CC_Store
5. THE Validador SHALL rejeitar qualquer mensagem CC onde o cc_value esteja fora do intervalo 0–127, impedindo o envio e mantendo o valor anterior no CC_Store
6. IF o write falha por erro de comunicação BLE (desconexão, timeout de 5 segundos, ou rejeição pelo controlador), THEN THE App SHALL reverter a atualização otimista no CC_Store ao valor anterior e exibir mensagem de erro ao usuário indicando falha no envio do comando
7. IF o Validador rejeita uma mensagem CC por valores fora dos intervalos permitidos, THEN THE App SHALL exibir mensagem de erro ao usuário indicando o campo inválido e não enviar o write BLE

### Requirement 6: Bulk Read por Canal

**User Story:** Como usuário, eu quero poder sincronizar todos os CCs de um canal específico sob demanda, para que eu possa atualizar a visualização quando necessário.

#### Acceptance Criteria

1. WHEN o usuário solicita sincronização de um canal, THE BLE_Manager SHALL escrever 1 byte com o número do canal (1–16) na BULK_CHAR_UUID e em seguida ler a resposta de 128 bytes, completando a operação em no máximo 200ms
2. WHEN a resposta de 128 bytes é recebida, THE CC_Store SHALL substituir atomicamente todos os 128 valores (cada um no intervalo 0–127) do canal correspondente pelos valores recebidos, onde byte[N] corresponde ao CC #N
3. IF o canal solicitado está fora do intervalo 1–16, THEN THE Validador SHALL rejeitar a operação sem enviar dados ao Controlador e indicar erro ao chamador informando que o canal é inválido
4. IF a operação de escrita ou leitura na BULK_CHAR_UUID falha por erro BLE ou a resposta retornada possui 0 bytes, THEN THE BLE_Manager SHALL abortar a sincronização, manter os valores anteriores no CC_Store inalterados e propagar o erro ao chamador
5. IF o dispositivo BLE não está conectado quando o usuário solicita sincronização, THEN THE BLE_Manager SHALL rejeitar a operação imediatamente e indicar erro de conexão ao chamador

### Requirement 7: Reconexão Automática

**User Story:** Como usuário, eu quero que o App reconecte automaticamente se a conexão BLE cair inesperadamente, para que eu não precise reconectar manualmente.

#### Acceptance Criteria

1. WHEN uma desconexão não iniciada pelo usuário é detectada (perda de sinal, timeout de conexão, ou erro do stack BLE), THE BLE_Manager SHALL aguardar 1 segundo e iniciar tentativas de reconexão automática com intervalo fixo de 2 segundos entre cada tentativa, até um máximo de 5 tentativas
2. WHILE a reconexão automática está em andamento, THE UI_Controller SHALL exibir o estado "Reconectando..." ao usuário, incluindo o número da tentativa atual (ex: tentativa 2 de 5)
3. WHEN a reconexão é bem-sucedida, THE BLE_Manager SHALL redescobrir serviços, reabilitar notificações na characteristic 0000ff01, e executar novamente o Sync_Completo para restaurar o estado do CC_Store
4. IF a reconexão falha após 5 tentativas consecutivas, THEN THE BLE_Manager SHALL parar as tentativas, transicionar para o estado "Desconectado", e THE UI_Controller SHALL exibir uma mensagem indicando falha na reconexão com opção para o usuário tentar reconectar manualmente
5. WHEN o usuário desconecta manualmente, THE BLE_Manager SHALL marcar a desconexão como intencional e desconectar sem iniciar reconexão automática
6. IF o Sync_Completo falha após uma reconexão bem-sucedida, THEN THE BLE_Manager SHALL manter a conexão BLE ativa, exibir indicação de erro de sincronização ao usuário, e permitir que o usuário inicie o Sync_Completo manualmente

### Requirement 8: Interface de Controle CC

**User Story:** Como usuário, eu quero uma interface com sliders e knobs para controlar os valores CC visualmente, para que eu tenha controle intuitivo sobre os parâmetros MIDI.

#### Acceptance Criteria

1. THE UI_Controller SHALL exibir um controle visual (slider ou knob) para cada um dos 128 controllers CC (0–127) do canal selecionado, identificando cada controle pelo seu número CC
2. THE UI_Controller SHALL exibir o valor numérico atual (0–127) ao lado de cada controle visual
3. WHEN o usuário move um slider ou knob, THE UI_Controller SHALL atualizar o valor numérico exibido em no máximo 100ms durante a interação, refletindo a posição atual do controle
4. WHEN o usuário finaliza a interação com um slider ou knob, THE App SHALL enviar o valor final ao Controlador via write CC com o canal selecionado, o número do controller correspondente e o valor resultante (0–127)
5. IF o envio do write CC falha (dispositivo desconectado ou erro de validação), THEN THE UI_Controller SHALL reverter o controle visual ao último valor confirmado e exibir uma indicação de erro ao usuário
6. THE UI_Controller SHALL permitir scroll vertical para navegar entre os controllers do canal selecionado
7. WHEN o App recebe uma notificação de mudança de CC do Controlador para o canal selecionado, THE UI_Controller SHALL atualizar a posição do controle visual e o valor numérico correspondente em no máximo 100ms

### Requirement 9: Exibição de Status de Conexão

**User Story:** Como usuário, eu quero ver claramente o estado da conexão BLE, para que eu saiba se o App está comunicando com o Controlador.

#### Acceptance Criteria

1. THE UI_Controller SHALL exibir o indicador de estado da conexão BLE em uma posição fixa visível sem necessidade de scroll, presente em todas as telas do aplicativo
2. THE UI_Controller SHALL representar cada estado de conexão com um rótulo textual e uma cor distinta para cada um dos seguintes estados: "Desconectado", "Escaneando", "Conectando", "Conectado" e "Reconectando"
3. WHEN o estado da conexão muda, THE UI_Controller SHALL atualizar o indicador de status em menos de 500ms
4. WHEN o aplicativo é iniciado, THE UI_Controller SHALL exibir o estado inicial como "Desconectado"
5. IF o Bluetooth do dispositivo está desativado ou indisponível, THEN THE UI_Controller SHALL exibir um estado "Bluetooth Indisponível" distinto dos demais estados de conexão, com uma indicação de que o usuário deve ativar o Bluetooth

### Requirement 10: Seleção de Canal MIDI

**User Story:** Como usuário, eu quero selecionar qual canal MIDI (1–16) estou visualizando e controlando, para que eu possa gerenciar diferentes instrumentos ou configurações.

#### Acceptance Criteria

1. THE UI_Controller SHALL exibir um seletor de canal MIDI com as 16 opções (1 a 16) simultaneamente visíveis ou acessíveis sem digitação, com o canal 1 selecionado por padrão ao iniciar o aplicativo
2. WHEN o usuário seleciona um canal diferente, THE UI_Controller SHALL atualizar os controles visuais para exibir os valores CC do canal selecionado a partir do CC_Store em no máximo 200ms após a interação
3. THE UI_Controller SHALL diferenciar visualmente o canal atualmente selecionado dos demais canais no seletor por meio de destaque distinguível (contraste visual diferente dos itens não selecionados)
4. IF o usuário seleciona um canal cujos dados ainda não foram sincronizados do dispositivo BLE, THEN THE UI_Controller SHALL exibir os valores padrão (0) para todos os 128 CCs do canal e iniciar uma sincronização (bulk read) do canal selecionado

### Requirement 11: Protocolo de Codificação e Decodificação

**User Story:** Como desenvolvedor, eu quero um módulo de protocolo que codifique e decodifique mensagens CC corretamente, para que a comunicação BLE seja confiável.

#### Acceptance Criteria

1. THE App SHALL codificar mensagens CC como exatamente 3 bytes no formato [channel (uint8, 1–16), controller_number (uint8, 0–127), cc_value (uint8, 0–127)] convertidos para base64 antes do envio via react-native-ble-plx
2. WHEN o App recebe uma mensagem CC via notificação ou read contendo exatamente 3 bytes válidos em base64, THE App SHALL decodificar a mensagem para os 3 campos numéricos do Protocolo_CC (channel 1–16, controller 0–127, value 0–127)
3. WHEN o App recebe uma resposta Bulk_Read contendo exatamente 128 bytes em base64, THE App SHALL decodificar a resposta para um array de 128 valores numéricos onde cada valor está no intervalo 0–127 e o índice do array corresponde ao controller_number
4. THE App SHALL codificar requisições Bulk_Read como exatamente 1 byte contendo o número do canal (1–16) convertido para base64
5. THE App SHALL garantir que para qualquer mensagem CC com channel entre 1–16, controller entre 0–127 e value entre 0–127, codificar e depois decodificar a mensagem produz valores idênticos aos originais (propriedade round-trip)
6. IF o App tenta decodificar uma mensagem CC cujo base64 resulta em menos de 3 bytes ou contém valores fora dos intervalos válidos (channel < 1 ou > 16, controller > 127, value > 127), THEN THE App SHALL retornar null e não propagar dados inválidos
7. IF o App recebe uma resposta Bulk_Read cujo base64 resulta em quantidade de bytes diferente de 128, THEN THE App SHALL retornar null indicando falha na decodificação
8. IF o App tenta codificar uma mensagem CC com valores fora dos intervalos válidos (channel < 1 ou > 16, controller > 127, value > 127), THEN THE App SHALL rejeitar a operação antes do envio BLE

### Requirement 12: Permissões e Configuração de Plataforma

**User Story:** Como usuário, eu quero que o App solicite as permissões necessárias para BLE, para que a funcionalidade Bluetooth funcione corretamente no meu dispositivo.

#### Acceptance Criteria

1. WHEN o App é iniciado em Android, THE App SHALL solicitar as permissões BLUETOOTH_SCAN, BLUETOOTH_CONNECT e ACCESS_FINE_LOCATION antes de iniciar qualquer operação BLE
2. THE App SHALL declarar NSBluetoothAlwaysUsageDescription no Info.plist para builds iOS
3. IF o usuário nega as permissões BLE, THEN THE App SHALL exibir uma mensagem indicando que as permissões são necessárias para conectar ao Controlador e oferecer um botão que direciona o usuário às configurações do sistema para conceder as permissões manualmente
4. WHEN o App detecta que o Bluetooth do dispositivo está desligado durante a inicialização ou durante o uso, THE App SHALL exibir uma mensagem visível na tela informando que o Bluetooth precisa ser ativado para conectar ao Controlador
5. IF o usuário concede as permissões BLE após tê-las negado anteriormente, THEN THE App SHALL prosseguir com a operação BLE sem exigir reinicialização do App

### Requirement 13: Controle de Versão e Entrega

**User Story:** Como desenvolvedor, eu quero que todo o código implementado seja commitado e enviado ao repositório remoto, para que o trabalho esteja versionado e acessível pela equipe.

#### Acceptance Criteria

1. WHEN toda a implementação da feature está concluída e os testes passam sem erros, THE App SHALL ter todo o código commitado no repositório git local com mensagens de commit que iniciem com um prefixo de tipo (feat, fix, refactor, docs, test, chore) seguido de dois-pontos e uma descrição do que foi alterado com no máximo 72 caracteres na linha de assunto
2. WHEN os commits locais estão finalizados, THE App SHALL ter o código enviado (push) para o repositório remoto em uma branch cujo nome siga o padrão "feature/ble-midi-controller"
3. WHEN o commit é criado, THE App SHALL garantir que não existem arquivos novos ou modificados não-rastreados (untracked ou unstaged) relacionados à feature no diretório de trabalho
4. IF o push para o repositório remoto falhar, THEN THE App SHALL exibir o erro retornado pelo git e o desenvolvedor SHALL tentar novamente após resolver o conflito ou problema de conectividade, sem perda dos commits locais
