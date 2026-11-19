# Inventário da oficina — Desafio 2

**«O cliente comprou um que já não existe»**: um computador foi vendido duas vezes no site, porque a segunda venda aconteceu quando o equipamento já tinha saído do inventário.

Este projeto é o sistema completo da oficina. Tem uma **versão com o erro** e uma **versão corrigida**, e cada estação do grupo tem uma página ou parte do código para demonstrar.

## Como correr

É preciso ter o **Node.js 18 ou mais recente** (https://nodejs.org). Não é preciso instalar mais nada: o projeto não usa bibliotecas externas nem base de dados.

```bash
node server.js erro        # versão COM o erro
node server.js corrigido   # versão CORRIGIDA
```

Depois, abrir **http://localhost:3000**. Para mudar de versão, parar o servidor com `Ctrl+C` e arrancar com o outro modo.

**Teste automático da venda dupla** (com o servidor a correr, noutra janela do terminal):

```bash
node teste-venda-dupla.js
```

## O que cada estação mostra

| Estação | Onde | O que mostrar |
|---|---|---|
| **E1** — estados e quando mudam | Página **Oficina**, no topo e no "Histórico de estados" | Em reparação → Pronto → Vendido. Mostrar o que faz mudar cada estado e que *Vendido* é final. Nos botões, só aparecem as transições permitidas. No código: `TRANSICOES` em `server.js` |
| **E2** — o campo que guarda o estado | Página **Oficina**, no quadro "Registo no ficheiro de dados", e o ficheiro `dados/inventario.json` | Clicar no 1042: o campo `estado` aparece destacado. Vender e ver mudar `estado`, `dataVenda` e `cliente` |
| **E3** — como a alteração chega ao servidor | Página **Oficina**, no quadro "Mensagens trocadas com o servidor" | Clicar "Marcar pronto": aparece a mensagem **enviada** (`mudarEstado`) e as **recebidas** (`estadoAlterado` para todos os browsers, e a `resposta`), com a hora ao milissegundo. No código: `websocket.js` e a parte `E3` de `server.js` |
| **E4** — de onde o site vai buscar o stock | Página **Loja online**, no quadro amarelo ou verde | Versão com erro: a lista vem do servidor **uma só vez** e fica guardada na página, por isso continua a mostrar o vendido. Versão corrigida: a página está ligada por socket e atualiza-se sozinha |
| **E5a** — as vendas não são constantes | Página **Vendas do ano** | Gráfico das vendas por mês, função V(t) = D + A·cos(2π(t − t₀)/12), com os parâmetros calculados a partir dos dados |
| **E5b** — venda anulada no pico e limites do modelo | Página **Vendas do ano**, no fundo | Taxa de anulação no pico e fora dele, porque custa mais no pico, e os meses onde o modelo falha (agosto, setembro e novembro) |

## Demonstração da venda dupla (para todo o grupo)

1. `node server.js erro` e abrir a **Loja online** em **dois separadores**.
2. No primeiro, comprar o Lenovo ThinkPad T480 (1042) com o cliente C-205.
3. No segundo, **sem atualizar**, mudar o cliente para C-207 e comprar o mesmo.
4. **As duas vendas são aceites.** Na **Oficina**, o registo 1042 ficou com o cliente C-207 por cima do C-205.
5. `node server.js corrigido` e repetir. O segundo separador **atualiza-se sozinho** e o ThinkPad desaparece. Mesmo que o pedido chegasse, o servidor recusava com «já não está disponível». O teste automático prova isto mesmo com os dois pedidos ao mesmo tempo.

O botão **Repor dados iniciais**, na página Início, volta ao inventário do princípio.

## Ficheiros

| Ficheiro | O que é |
|---|---|
| `server.js` | Servidor: inventário, estados, vendas (versão com erro e corrigida), API e socket |
| `websocket.js` | Servidor WebSocket feito à mão, sem bibliotecas (E3) |
| `public/index.html` | Página inicial, com as ligações e os passos da demonstração |
| `public/oficina.html` | Aplicação da oficina (E1, E2, E3) |
| `public/loja.html` | Loja online (E4) |
| `public/vendas.html` | Vendas do ano e modelo periódico (E5a, E5b) |
| `public/comum.js`, `public/estilo.css` | Código e estilo partilhados pelas páginas |
| `dados/inventario-inicial.json` | Inventário inicial, com o histórico de estados de cada equipamento |
| `dados/inventario.json` | Inventário atual. É criado ao arrancar (E2) |
| `dados/vendas.json` | Registo de todas as tentativas de venda, aceites e recusadas |
| `dados/vendas-mensais.json` | Vendas por mês de 2025, com dados de exemplo (E5) |
| `teste-venda-dupla.js` | Teste das duas vendas ao mesmo tempo |

## Porquê Node.js (JavaScript)

1. **Usa a mesma linguagem no servidor e no browser.** A oficina, a loja e o servidor estão todos em JavaScript, por isso as estações ligam-se sem traduções.
2. **Tem WebSocket nativo no browser.** A E3 fala de sockets, e o browser já os tem. No servidor, o protocolo foi feito à mão (`websocket.js`), por isso não é preciso instalar nada.
3. **O inventário é um ficheiro JSON**, que é o formato natural do JavaScript. É exatamente o "ficheiro de dados do inventário" que a E2 pede para mostrar.
4. **Trata vários pedidos ao mesmo tempo (é assíncrono).** É isso que deixa duas vendas "entrarem no meio" uma da outra, por isso o erro acontece de verdade, como num site real.
5. **Só precisa do Node instalado.** Corre em qualquer computador da escola.

**Alternativa rejeitada: PHP + MySQL.** É muito usada em lojas online, mas precisa do XAMPP e de uma base de dados, e o PHP não tem sockets em tempo real de forma simples. Num site real com base de dados, a correção seria uma só instrução:

```sql
UPDATE equipamentos
SET estado = 'vendido', dataVenda = NOW(), cliente = 'C-207'
WHERE id = 1042 AND estado = 'pronto';
-- 0 linhas alteradas = já vendido -> venda recusada
```

## Problemas que o código pode ter e como foram resolvidos

| # | Problema | O que acontece | Resolução |
|---|---|---|---|
| 1 | **Não verifica o estado antes de vender** | Um equipamento *vendido* ou *em reparação* pode ser vendido (outra vez) | Só aceita transições permitidas (`TRANSICOES`): só se vende o que está *pronto*. Se não, recusa com HTTP 409 |
| 2 | **Duas vendas ao mesmo tempo (condição de corrida)** | As duas leem *pronto*, as duas gravam, e a segunda escreve o cliente por cima do primeiro | As alterações passam por uma **fila**, uma de cada vez: ler, verificar e gravar acontecem sem interrupção |
| 3 | **Página da loja desatualizada** | Num separador antigo, o equipamento vendido continua à venda | A loja corrigida ouve o servidor por socket e atualiza-se. E quem decide é sempre o **servidor** |
| 4 | **Transições impossíveis** | Passar de *vendido* para *em reparação*, ou de *em reparação* para *vendido* | O servidor valida cada mudança contra `TRANSICOES` (E1) |
| 5 | **Ficheiro estragado se o programa falhar a meio** | O `inventario.json` fica meio escrito e ilegível | Grava num ficheiro temporário e só depois o renomeia |
| 6 | **A ligação do socket cai** | A oficina ou a loja deixam de receber atualizações | As páginas voltam a ligar sozinhas a cada 2 segundos e mostram "Socket: desligado" |
| 7 | **Mensagens inválidas ou enormes no socket** | JSON partido, tipo desconhecido, mensagens de vários MB | O JSON inválido é ignorado, o tipo desconhecido dá erro e as mensagens acima de 64 KB fecham a ligação |
| 8 | **Dados inválidos** | Id que não é número, cliente vazio, preço negativo | Validação, com erro 400 e uma mensagem clara |
| 9 | **Injeção de HTML** | Um nome com código HTML podia alterar a página | As páginas usam `textContent` e nunca inserem HTML vindo dos dados |
| 10 | **Acesso a ficheiros do servidor** | Um pedido como `/../server.js` podia mostrar o código | O servidor só serve ficheiros de dentro da pasta `public`, e só de tipos conhecidos |

## Limitações (quando a correção deixa de chegar)

- **Vários servidores ao mesmo tempo:** a fila só funciona dentro de um programa. Seria preciso uma base de dados com transações, ou o `UPDATE … WHERE estado = 'pronto'` acima.
- **Várias unidades do mesmo modelo:** um campo `estado` não chega. É preciso um campo `quantidade`, que nunca pode descer abaixo de zero.
- **Segurança:** não há login. Qualquer pessoa pode mudar estados ou repor os dados.
- **Pagamento lento:** na fila, cada venda espera pela anterior. Num site grande, o melhor seria marcar o equipamento como *reservado* durante o pagamento.
- **Modelo das vendas (E5):** dá a tendência por mês, mas não prevê picos curtos (Black Friday), acontecimentos únicos, nem se um equipamento específico existe.
