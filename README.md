# Organizador Financeiro (v2) 💳

Agora com **abas** (v3):
- 🏠 **Capa**: resumo do mês + gráficos + tabela filtrável
- 🗂️ **Base de dados**: tabela completa (com mês) + importar/adicionar manualmente
- 👨‍👩‍👧‍👦 **Pessoas**: Pai, Mãe, Irmão, Eu com **total ao lado** + abertos/pagos

## Como usar
1. Abra `index.html`.
2. Clique em **Importar** (ou na aba Base) para adicionar linhas.
3. Use **Exportar** para backup em Excel.

## Dica
- Os dados ficam no **LocalStorage do navegador**.
- Para levar para outro PC, exporte e depois importe.


## v3: Detalhes na aba Pessoas
- Clique no card (ex.: **Pai**) ou em **Detalhar** para ver a lista de gastos detalhada logo abaixo.


## v4: Extras e status dos cartões
- Na **Capa**, a seção **Status dos cartões** permite marcar se cada cartão foi pago e registrar **crédito do cheque especial**.
- Na aba **Pessoas**, ao selecionar alguém, você pode adicionar **Extras (manual)** como empréstimos, ajustes etc.


## v4.2: Divisão de gastos (Eu x Mãe / Eu x Pai)
- Na importação, se a coluna **quem** vier como `Eu x Mãe` (ou `Mãe x Eu`, `Eu x Pai`, etc.), o site divide o **valor em dois lançamentos**, metade para cada pessoa, com observação `Dividido com ... (1/2)`.


## v4.3: Campo "dividido" na planilha
- Na aba **LANCAMENTOS**, você pode usar a coluna **dividido**.
  - Ex.: `quem=Eu` e `dividido=Mãe` → o site divide o valor em dois lançamentos (metade para cada).
- No cadastro manual, existe o campo **Dividido com (opcional)** com o mesmo comportamento.
