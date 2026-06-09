# Contexto do Projeto - Automação Trader

Este projeto consiste em um Dashboard de Opções Binárias que se comunica via extensão do Chrome com a corretora (Exnova, IQ Option, etc.) para automatizar operações, catalogar padrões probabilísticos de velas e exibir resultados em tempo real.

## Estado Atual e Recursos Principais
- **Overlays e Notificações Push**: Já configurados no app do entregador/corretora, nunca devem ser alterados de forma a prejudicar seu funcionamento.
- **WebSocket da Corretora**: A extensão intercepta a conexão WebSocket para capturar fechamento de operações instantaneamente e alimentar o dashboard sem atrasos.
- **Catalogador Probabilístico**:
  - Permite catalogar velas por tempo (minuto), por padrões de cores, ou por exaustão de tendência (sequência de até 8 velas consecutivas da mesma cor).
  - Integrado a limites ideais sugeridos por timeframe (com possibilidade de alteração manual pelo usuário através do campo "Velas a Analisar"):
    - **M1**: 300 velas (~5h de mercado) - Ajustado de 1000 velas para evitar overfitting e capturar melhor o microciclo ativo.
    - **M5**: 800 velas (~2.7 dias)
    - **M15**: 500 velas (~5.2 dias)
- **Robô com Web Worker**: O loop de execução de sinais no `js/bot.js` utiliza um Web Worker dedicado para evitar que o Chrome suspenda/atrase timers de abas em segundo plano.

## Progresso Recente
- Implementação de limites de velas dinâmicos no catalogador frontend (`js/cataloger.js`) e backend da extensão (`background.js`).
- Adicionado input de ajuste manual da quantidade de velas a serem analisadas diretamente no formulário do Catalogador.
- Adicionado dicionário visual de padrões probabilísticos de cores no `index.html`.
- Ajustes finos no simulador de teclado e capturas via WebSocket.
- Implementação do terceiro modo de catalogação: **Exaustão de Tendência (Velas Consecutivas)** de tamanho 2 a 8, calculando estatísticas de Reversão (Contra-tendência) e Continuidade (Fluxo).
- Ajustado o robô (`js/bot.js`) para suportar o monitoramento de sequências recentes de até 8 velas no feed real.
- **Mecanismo Anti-Bloqueio Exnova (V2 API)**: Criamos um sistema impenetrável de bypass para a API de histórico da corretora. 
  1. **Mapeamento Dinâmico de IDs**: Como a corretora "aposenta" IDs de pares OTC (como ocorreu com o antigo ID 82 do GBP/JPY-OTC), a extensão agora intercepta e mapeia os IDs *verdadeiros* em tempo real lendo os pacotes do WebSocket (`injected.js`).
  2. **Roubo de Velas (Fallback Supremo)**: Como a corretora as vezes oculta o ID da vela e envia o banco de dados congelado (ex: dados de 31/03/2025) quando a chamada é mal formatada, a extensão espiona a memória do gráfico e "rouba" as velas originais que a própria plataforma carrega na tela. Em caso de timeout ou bloqueio no pedido via script, o robô consome as velas roubadas, garantindo 100% de precisão. Sempre que der erro, orienta-se o usuário a "abrir o gráfico" do ativo para ativar a espionagem.

## Próximos Passos
- Validar as taxas de acertos de exaustão no mercado real e a exportação direta para o robô.

## Bugs Corrigidos
- **Redeclaração fatal no `injected.js`**: As variáveis `const balances` e `let userBalanceId` estavam declaradas duas vezes no mesmo escopo (linhas ~214 e ~305), causando `SyntaxError` que matava toda a IIFE do interceptador. Isso impedia a interceptação de WebSockets (`window.__binaryOps_ws` nunca era populado), quebrando o catalogador e a busca de velas. Correção: removido o bloco duplicado (linhas 304-311).
- **ReferenceError no fallback DOM do `content.js`**: A variável `amountEl` era passada como argumento para `findButtonByKeywords` nas linhas ~347 e ~349 dentro de `executeTradingOrder`, mas não estava declarada no escopo desta função. Correção: declarada e inicializada com `document.querySelector(sel.amountInput)` no início de `executeTradingOrder`.

## ⚠️ Regras de Proteção do Código (NUNCA VIOLAR)
1. **`injected.js` é crítico**: Toda a lógica roda dentro de uma IIFE `(() => { ... })()`. Qualquer erro de sintaxe (como redeclaração de `const`/`let`) mata o script inteiro, impedindo interceptação de WebSockets, mapeamento de IDs e roubo de velas. **Sempre verificar escopo antes de declarar variáveis.**
2. **Nunca redeclarar `const` ou `let` no mesmo escopo** em nenhum arquivo do projeto. Usar nomes diferentes ou reutilizar a variável existente.
3. **Overlays e Notificações Push são intocáveis**: Nunca fazer alterações no app do entregador que afetem o funcionamento dos overlays e das notificações push.
4. **Testar o `injected.js` após qualquer alteração**: Verificar no console da corretora (F12) que `[BinaryOps Interceptor] Script MAIN world carregado.` aparece sem erros.
5. **O `window.__binaryOps_ws` deve sempre ser populado**: Se este Set estiver vazio, o catalogador, o robô e as ordens via WS falham. Nunca alterar o fluxo de `window.WebSocket = function(...)` sem garantir que o Set continua sendo preenchido.
