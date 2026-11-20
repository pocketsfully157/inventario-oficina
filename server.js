// =============================================================
//  Inventário da oficina — servidor do projeto completo
//  Node.js, sem bibliotecas externas (Node 18 ou mais recente)
//
//    node server.js erro        -> versão COM o erro (venda dupla)
//    node server.js corrigido   -> versão CORRIGIDA
//
//  Depois abrir http://localhost:3000
//
//  Estações:
//    E1  estados e transições          -> TRANSICOES, mudarEstado...
//    E2  campo "estado" no ficheiro     -> dados/inventario.json
//    E3  alteração chega ao servidor    -> WebSocket em /socket
//    E4  de onde o site lê o stock      -> /api/inventario + loja.html
//    E5  vendas ao longo do ano         -> /api/vendas-mensais + vendas.html
// =============================================================

const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { criarServidorWebSocket } = require('./websocket');

const PORTA = Number(process.env.PORTA) || 3000;
const MODO = (process.argv[2] || process.env.MODO || 'corrigido').toLowerCase();

if (MODO !== 'erro' && MODO !== 'corrigido') {
  console.error('Modo inválido. Use: node server.js erro   ou   node server.js corrigido');
  process.exit(1);
}

const PASTA_DADOS = path.join(__dirname, 'dados');
const PASTA_PUBLICA = path.join(__dirname, 'public');
const FICHEIRO_INVENTARIO = path.join(PASTA_DADOS, 'inventario.json');
const FICHEIRO_INICIAL = path.join(PASTA_DADOS, 'inventario-inicial.json');
const FICHEIRO_VENDAS = path.join(PASTA_DADOS, 'vendas.json');
const FICHEIRO_VENDAS_MENSAIS = path.join(PASTA_DADOS, 'vendas-mensais.json');

// Tempo (ms) que simula o processamento do pagamento.
// É neste intervalo que uma segunda venda pode "entrar no meio".
const TEMPO_PAGAMENTO = 300;

// -------------------------------------------------------------
//  E1 — Estados e transições permitidas
// -------------------------------------------------------------
const ESTADOS = {
  em_reparacao: 'Em reparação',
  pronto: 'Pronto',
  vendido: 'Vendido',
};

// De cada estado, para onde se pode ir, e porquê (o momento em que muda)
const TRANSICOES = {
  em_reparacao: { pronto: 'Reparação concluída e testada' },
  pronto: { vendido: 'Venda confirmada (pagamento feito)', em_reparacao: 'Defeito detetado, volta à reparação' },
  vendido: {}, // estado final: um equipamento vendido não muda mais
};

// -------------------------------------------------------------
//  Funções auxiliares
// -------------------------------------------------------------
function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function agora() {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())} ` +
         `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}

async function lerJSON(ficheiro, valorPorDefeito) {
  try {
    return JSON.parse(await fs.readFile(ficheiro, 'utf8'));
  } catch (erro) {
    if (erro.code === 'ENOENT') return valorPorDefeito;
    throw erro;
  }
}

// Grava num ficheiro temporário e só depois renomeia:
// se o programa falhar a meio, o ficheiro original fica intacto.
async function gravarJSON(ficheiro, dados) {
  const temporario = `${ficheiro}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(temporario, JSON.stringify(dados, null, 2), 'utf8');
  await fs.rename(temporario, ficheiro);
}

// Fila: as tarefas passadas aqui correm UMA DE CADA VEZ
function criarFila() {
  let ultima = Promise.resolve();
  return function umDeCadaVez(tarefa) {
    const resultado = ultima.then(tarefa);
    ultima = resultado.catch(() => {});
    return resultado;
  };
}

const filaAlteracoes = criarFila(); // usada na versão corrigida (e para adicionar/repor)
const filaRegisto = criarFila();    // o registo de vendas é sempre feito em fila

const sucesso = (mensagem, equipamento) => ({ ok: true, codigo: 200, mensagem, equipamento });
const falha = (codigo, erro) => ({ ok: false, codigo, erro });

function registarVenda(id, cliente, origem, resultado) {
  return filaRegisto(async () => {
    const vendas = await lerJSON(FICHEIRO_VENDAS, []);
    vendas.push({ data: agora(), id, cliente, origem, resultado });
    await gravarJSON(FICHEIRO_VENDAS, vendas);
  });
}

// Muda o estado no registo, guarda no ficheiro e avisa todos os browsers (E3)
async function aplicarMudanca(inventario, equipamento, novoEstado, cliente, origem) {
  const anterior = equipamento.estado;
  const data = agora();

  equipamento.estado = novoEstado;
  if (novoEstado === 'vendido') {
    equipamento.dataVenda = data;
    equipamento.cliente = cliente;
  }
  equipamento.historico = equipamento.historico || [];
  equipamento.historico.push({
    estado: novoEstado,
    data,
    origem,
    motivo: TRANSICOES[anterior]?.[novoEstado] || 'Alteração feita sem validação',
  });

  await gravarJSON(FICHEIRO_INVENTARIO, inventario);
  if (novoEstado === 'vendido') await registarVenda(equipamento.id, cliente, origem, 'aceite');

  socket.difundir({ tipo: 'estadoAlterado', id: equipamento.id, estadoAnterior: anterior, estado: novoEstado, origem, data, equipamento });
}

function textoSucesso(equipamento, novoEstado, cliente) {
  return novoEstado === 'vendido'
    ? `Venda aceite: ${equipamento.equipamento} para ${cliente}.`
    : `${equipamento.equipamento} passou a "${ESTADOS[novoEstado]}".`;
}

// -------------------------------------------------------------
//  VERSÃO COM ERRO
// -------------------------------------------------------------
async function mudarEstadoComErro(id, novoEstado, cliente, origem) {
  const inventario = await lerJSON(FICHEIRO_INVENTARIO, []);
  const equipamento = inventario.find((e) => e.id === id);
  if (!equipamento) return falha(404, 'Esse equipamento não existe no inventário.');

  // ERRO 1: não verifica o estado atual nem se a transição é permitida.
  //         Um equipamento "vendido" pode ser vendido outra vez.

  if (novoEstado === 'vendido') await esperar(TEMPO_PAGAMENTO); // simula o pagamento

  // ERRO 2: o inventário foi lido ANTES do pagamento. Se outra venda gravou
  //         entretanto, escrevemos por cima dela com dados desatualizados.
  await aplicarMudanca(inventario, equipamento, novoEstado, cliente, origem);
  return sucesso(textoSucesso(equipamento, novoEstado, cliente), equipamento);
}

// -------------------------------------------------------------
//  VERSÃO CORRIGIDA
// -------------------------------------------------------------
function mudarEstadoCorrigido(id, novoEstado, cliente, origem) {
  // CORREÇÃO 2: uma alteração de cada vez — ler, verificar e gravar sem ninguém entrar no meio
  return filaAlteracoes(async () => {
    const inventario = await lerJSON(FICHEIRO_INVENTARIO, []);
    const equipamento = inventario.find((e) => e.id === id);
    if (!equipamento) return falha(404, 'Esse equipamento não existe no inventário.');

    // CORREÇÃO 1: só aceita transições permitidas (só vende o que está "pronto")
    if (!TRANSICOES[equipamento.estado][novoEstado]) {
      if (novoEstado === 'vendido') await registarVenda(id, cliente, origem, 'recusada');

      let erro;
      if (equipamento.estado === 'vendido') erro = 'Este equipamento já não está disponível (já foi vendido).';
      else if (equipamento.estado === novoEstado) erro = `O equipamento já está "${ESTADOS[novoEstado]}".`;
      else if (novoEstado === 'vendido') erro = 'Este equipamento ainda está em reparação.';
      else erro = `Não é possível passar de "${ESTADOS[equipamento.estado]}" para "${ESTADOS[novoEstado]}".`;
      return falha(409, erro);
    }

    if (novoEstado === 'vendido') await esperar(TEMPO_PAGAMENTO); // simula o pagamento

    await aplicarMudanca(inventario, equipamento, novoEstado, cliente, origem);
    return sucesso(textoSucesso(equipamento, novoEstado, cliente), equipamento);
  });
}

// Valida os dados e escolhe a versão conforme o modo
async function mudarEstado(dados, origem) {
  const id = Number(dados.id);
  const novoEstado = String(dados.estado ?? '');
  let cliente = String(dados.cliente ?? '').trim();

  if (!Number.isInteger(id)) return falha(400, 'O id do equipamento tem de ser um número inteiro.');
  if (!ESTADOS[novoEstado]) return falha(400, 'Estado desconhecido.');
  if (novoEstado === 'vendido') {
    if (!cliente && origem === 'oficina') cliente = 'Balcão';
    if (cliente.length === 0 || cliente.length > 20) return falha(400, 'Indique o cliente (1 a 20 caracteres).');
  }

  return MODO === 'erro'
    ? mudarEstadoComErro(id, novoEstado, cliente, origem)
    : mudarEstadoCorrigido(id, novoEstado, cliente, origem);
}

// Entrada de um equipamento novo na oficina (começa "em reparação")
function adicionarEquipamento(dados) {
  const nome = String(dados.equipamento ?? '').trim();
  const preco = Number(dados.preco);
  if (nome.length === 0 || nome.length > 50) return Promise.resolve(falha(400, 'Indique o nome do equipamento (1 a 50 caracteres).'));
  if (!Number.isFinite(preco) || preco < 0 || preco > 10000) return Promise.resolve(falha(400, 'O preço tem de estar entre 0 e 10000 €.'));

  return filaAlteracoes(async () => {
    const inventario = await lerJSON(FICHEIRO_INVENTARIO, []);
    const id = inventario.reduce((maior, e) => Math.max(maior, e.id), 1000) + 1;
    const equipamento = {
      id,
      equipamento: nome,
      preco: Math.round(preco * 100) / 100,
      estado: 'em_reparacao',
      dataVenda: null,
      cliente: null,
      historico: [{ estado: 'em_reparacao', data: agora(), origem: 'oficina', motivo: 'Entrada na oficina' }],
    };
    inventario.push(equipamento);
    await gravarJSON(FICHEIRO_INVENTARIO, inventario);
    socket.difundir({ tipo: 'equipamentoAdicionado', equipamento });
    return sucesso(`${nome} deu entrada na oficina com o número ${id}.`, equipamento);
  });
}

async function reporDados() {
  await filaAlteracoes(async () => {
    await gravarJSON(FICHEIRO_INVENTARIO, await lerJSON(FICHEIRO_INICIAL, []));
    await gravarJSON(FICHEIRO_VENDAS, []);
  });
  socket.difundir({ tipo: 'inventarioReposto' });
}

// -------------------------------------------------------------
//  Servidor HTTP
// -------------------------------------------------------------
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function responderJSON(res, codigo, corpo) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo, null, 2));
}

function lerCorpo(pedido) {
  return new Promise((resolve, reject) => {
    let dados = '';
    pedido.on('data', (parte) => {
      dados += parte;
      if (dados.length > 10000) {
        reject(new Error('Pedido demasiado grande.'));
        pedido.destroy();
      }
    });
    pedido.on('end', () => {
      try { resolve(dados ? JSON.parse(dados) : {}); }
      catch { reject(new Error('O pedido não é JSON válido.')); }
    });
    pedido.on('error', reject);
  });
}

async function servirFicheiro(res, caminho) {
  let nome;
  try { nome = decodeURIComponent(caminho === '/' ? '/index.html' : caminho); }
  catch { return responderJSON(res, 400, { erro: 'Endereço inválido.' }); }

  const completo = path.normalize(path.join(PASTA_PUBLICA, nome));
  const tipo = TIPOS[path.extname(completo)];
  // Impede pedidos do tipo /../server.js (sair da pasta public)
  if (!completo.startsWith(PASTA_PUBLICA + path.sep) || !tipo) {
    return responderJSON(res, 404, { erro: 'Página não encontrada.' });
  }
  try {
    const conteudo = await fs.readFile(completo);
    res.writeHead(200, { 'Content-Type': tipo });
    res.end(conteudo);
  } catch {
    responderJSON(res, 404, { erro: 'Página não encontrada.' });
  }
}

const servidor = http.createServer(async (pedido, res) => {
  const url = new URL(pedido.url, 'http://localhost');
  const rota = `${pedido.method} ${url.pathname}`;

  try {
    switch (rota) {
      case 'GET /api/inventario': // E2/E4: o site vai buscar o stock AQUI, ao servidor
        return responderJSON(res, 200, { modo: MODO, geradoEm: agora(), inventario: await lerJSON(FICHEIRO_INVENTARIO, []) });

      case 'GET /api/estados': // E1
        return responderJSON(res, 200, { estados: ESTADOS, transicoes: TRANSICOES });

      case 'GET /api/vendas': // registo de todas as tentativas de venda
        return responderJSON(res, 200, await lerJSON(FICHEIRO_VENDAS, []));

      case 'GET /api/vendas-mensais': // E5
        return responderJSON(res, 200, await lerJSON(FICHEIRO_VENDAS_MENSAIS, { meses: [] }));

      case 'POST /api/vender': { // compra feita na loja online: { "id": 1042, "cliente": "C-205" }
        const corpo = await lerCorpo(pedido);
        const resultado = await mudarEstado({ id: corpo.id, estado: 'vendido', cliente: corpo.cliente }, 'loja');
        return responderJSON(res, resultado.codigo, resultado);
      }

      case 'POST /api/repor':
        await reporDados();
        return responderJSON(res, 200, { ok: true, mensagem: 'Inventário reposto aos dados iniciais.' });

      default:
        if (pedido.method === 'GET') return servirFicheiro(res, url.pathname);
        return responderJSON(res, 404, { erro: 'Página não encontrada.' });
    }
  } catch (erro) {
    console.error(erro);
    responderJSON(res, 500, { ok: false, erro: erro.message || 'Erro interno do servidor.' });
  }
});

// -------------------------------------------------------------
//  E3 — WebSocket: a aplicação da oficina envia alterações por aqui
// -------------------------------------------------------------
const socket = criarServidorWebSocket(
  servidor,
  '/socket',
  async (cliente, mensagem) => {
    const resposta = { tipo: 'resposta', pedidoId: mensagem.pedidoId ?? null };
    try {
      let resultado;
      if (mensagem.tipo === 'mudarEstado') resultado = await mudarEstado(mensagem, 'oficina');
      else if (mensagem.tipo === 'adicionar') resultado = await adicionarEquipamento(mensagem);
      else resultado = falha(400, 'Tipo de mensagem desconhecido.');
      cliente.enviar({ ...resposta, ...resultado });
    } catch (erro) {
      cliente.enviar({ ...resposta, ...falha(500, erro.message) });
    }
  },
  (cliente) => cliente.enviar({ tipo: 'boasVindas', modo: MODO, mensagem: 'Ligado ao servidor do inventário.' })
);

(async () => {
  if ((await lerJSON(FICHEIRO_INVENTARIO, null)) === null) await reporDados();
  servidor.listen(PORTA, () => {
    console.log('-----------------------------------------------');
    console.log(` Inventário da oficina — modo: ${MODO.toUpperCase()}`);
    console.log(` Abrir no browser: http://localhost:${PORTA}`);
    console.log('-----------------------------------------------');
  });
})();
