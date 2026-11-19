# Desafio 2 — «O cliente comprou um que já não existe» · Equipa 4EH

Trabalho do **grupo 1** para o desafio 2 do **SkillLABS 1** (Inforlândia). O código base é o do repositório da turma:
https://github.com/Hugo1307/EPA-SkillLabs-4EH/tree/main/desafio-02

> **O desafio:** um computador foi vendido duas vezes no site. A segunda venda aconteceu depois de o equipamento já ter saído do inventário. Mostrem como a equipa descobre onde está o erro e como o corrige.

O histórico de commits mostra o trabalho por passos:

1. **Base** — o código original, sem alterações.
2. **Correção** — a única alteração à aplicação (7 linhas no `servidor.js`).
3. **Apoio** — scripts para demonstrar o erro e para a análise de vendas (E5), mais este README.

---

## Como correr

Instruções completas no [README da turma](https://github.com/Hugo1307/EPA-SkillLabs-4EH#como-correr-o-código). Em resumo, com o Node.js instalado:

```
cd desafio-02
node servidor.js
```

Abrir **http://localhost:3000**. Não é preciso `npm install`.

### Scripts de apoio (dentro de `desafio-02/`)

| Comando | O que faz |
|---|---|
| `node teste-compra-dupla.js` | Com o servidor a correr, dois clientes compram o INF-0004 ao mesmo tempo e um terceiro tenta mais tarde. Mostra o estado antes e depois |
| `node repor-inventario.js` | Volta a pôr o `inventario.json` como no início (cópia em `dados/inventario-original.json`) |
| `node analise-vendas.js` | E5: lê `dados/vendas.csv`, calcula o modelo periódico e compara com as vendas reais |

---

## O erro

Na rota `POST /comprar` (`servidor.js`, função `comprar`), o servidor **verificava** se o equipamento estava `"pronto"`, mas **nunca mudava o estado para `"vendido"` nem guardava o inventário**:

```js
if (equipamento.estado !== "pronto") {
  responderJSON(resposta, 409, { mensagem: "Indisponível: …" });
  return;
}

responderJSON(resposta, 200, { mensagem: "Compra efetuada: " + equipamento.nome });
// ← o inventario.json continua com "estado": "pronto"
```

A função `guardarInventario()` existia, mas **nunca era chamada**. Depois de cada venda o equipamento continuava `"pronto"` no ficheiro, por isso podia ser vendido outra vez, e outra, e outra.

**Como o descobrimos:** comprámos o INF-0004 e voltámos a abrir o `inventario.json`. O estado continuava `"pronto"`. No terminal, cada compra aparecia como `POST /comprar`, mas o ficheiro nunca mudava. Resultado do teste com o código original:

```
Estado antes:         pronto
Cliente A:            200 — Compra efetuada: Portátil Lenovo ThinkPad T480
Cliente B:            200 — Compra efetuada: Portátil Lenovo ThinkPad T480
Estado depois:        pronto
Cliente C (depois):   200 — Compra efetuada: Portátil Lenovo ThinkPad T480
```

## A correção

Duas linhas antes de responder ao cliente:

```js
equipamento.estado = "vendido";
guardarInventario(equipamentos);
```

Resultado do mesmo teste depois da correção:

```
Estado antes:         pronto
Cliente A:            200 — Compra efetuada: Portátil Lenovo ThinkPad T480
Cliente B:            409 — Indisponível: o equipamento está vendido.
Estado depois:        vendido
Cliente C (depois):   409 — Indisponível: o equipamento está vendido.
```

### Fundamentar a decisão (Fase B)

- **Critério:** corrigir no **servidor**, que é onde está o inventário (a fonte da verdade), com a menor alteração possível. São duas linhas e usam uma função que já existia.
- **Porque funciona mesmo com duas compras ao mesmo tempo:** `lerInventario()` e `guardarInventario()` usam `readFileSync` e `writeFileSync` (síncronos). O Node só tem uma linha de execução, por isso ler → verificar → gravar corre do princípio ao fim sem que outro pedido entre no meio.
- **Alternativa rejeitada:** corrigir só na página (`script.js`), por exemplo atualizando a lista mais vezes ou desativando o botão. Foi rejeitada porque uma página aberta antes da venda continua desatualizada, e qualquer pessoa pode enviar o pedido `POST /comprar` diretamente. A página ajuda, mas quem decide tem de ser o servidor.
- **O que mudámos pelo caminho:** ao início pensámos que faltava verificar o estado. Ao ler o código vimos que a verificação já existia. O que faltava era **gravar** o novo estado.
- **Condição que tornaria a correção insuficiente:**
  - se a leitura ou a gravação passassem a ser **assíncronas** (`await fs.promises…`), porque duas compras podiam ler `"pronto"` antes de alguma gravar;
  - se houvesse **vários servidores** a usar o mesmo inventário, porque seria preciso uma base de dados com transações;
  - se houvesse **várias unidades do mesmo modelo**, porque seria preciso guardar uma quantidade em vez de um só estado.

---

## O que cada estação mostra

| Estação | Onde, neste código |
|---|---|
| **E1** — estados e quando mudam | Três estados no `inventario.json` e no comentário da função `comprar`: `"em reparação"` → `"pronto"` (quando a reparação acaba; neste desafio muda-se à mão no ficheiro) → `"vendido"` (no `POST /comprar`, depois da correção). `"vendido"` é final |
| **E2** — o campo que guarda o estado | O campo `"estado"` de cada equipamento no `inventario.json`. **Antes** da correção não mudava quando havia uma venda (era esse o erro). **Depois**, passa de `"pronto"` para `"vendido"` |
| **E3** — como a alteração chega ao servidor | Ao carregar em **Comprar**, o `script.js` envia `POST /comprar` com `{"numeroSerie": "INF-0004"}` (função `comprar`). Aparece no terminal e no separador **Rede** do F12. O servidor responde 200 ou 409 e grava o ficheiro |
| **E4** — de onde o site vai buscar o stock | Ao **servidor**: o `script.js` faz `GET /produtos` quando a página abre e depois de cada compra, e o servidor lê o `inventario.json` em cada pedido. A página ainda mostrava o equipamento vendido porque o servidor nunca gravava `"vendido"`. Além disso, outras páginas abertas não se atualizam sozinhas |
| **E5a / E5b** — vendas ao longo do ano | `node analise-vendas.js` com `dados/vendas.csv` (2024 e 2025). Ver abaixo |

### E5 — resultados de `analise-vendas.js`

**Modelo:** V(t) = 40,3 + 18,4 · cos(2π(t − 9,04)/12)

- O **pico é em setembro** (t₀ ≈ 9, regresso às aulas) e o **mínimo em março**. As vendas variam entre cerca de 22 e 59 por mês.
- O modelo acompanha bem os dados: em quase todos os meses a diferença é menor que 10%. Afasta-se mais perto do mínimo (fevereiro e março, até 14%), onde as vendas ficam "paradas" em vez de descerem e subirem como uma curva.
- **Vendas anuladas:** a taxa é parecida em todo o ano (cerca de 6,3%), mas no pico há **mais anulações por mês** (3,3 contra 1,8). Cada uma custa mais: o cliente precisa do equipamento para o início das aulas, não tem tempo para esperar e vai à concorrência, e a equipa está mais ocupada.
- **Onde o modelo deixa de servir:** acontecimentos que não se repetem todos os anos (crises, promoções especiais, falta de stock), previsões para um dia concreto, e o facto de serem só dois anos de dados. O modelo também não diz se um equipamento **específico** ainda existe: isso é o campo `estado` (E2).

---

## Objeto físico: o inventário antes e depois da correção

A linha em causa é a do **INF-0004**. Depois de uma compra:

| | Antes da correção | Depois da correção |
|---|---|---|
| `inventario.json` | `{ "numeroSerie": "INF-0004", "nome": "Portátil Lenovo ThinkPad T480", "preco": 289, "estado": "pronto" }` | `{ "numeroSerie": "INF-0004", "nome": "Portátil Lenovo ThinkPad T480", "preco": 289, "estado": "vendido" }` |
| Segunda compra | Aceite (200) | Recusada (409) |
