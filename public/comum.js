// Funções usadas por todas as páginas

const NOMES_ESTADO = { em_reparacao: 'Em reparação', pronto: 'Pronto', vendido: 'Vendido' };

// Cria um elemento HTML. O texto entra sempre com textContent (evita injeção de HTML).
function el(tag, props = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (chave === 'class') elemento.className = valor;
    else if (chave === 'text') elemento.textContent = valor;
    else if (chave.startsWith('on')) elemento[chave] = valor;
    else elemento.setAttribute(chave, valor);
  }
  for (const filho of filhos) {
    if (filho === null || filho === undefined) continue;
    elemento.append(typeof filho === 'string' || typeof filho === 'number' ? String(filho) : filho);
  }
  return elemento;
}

function etiquetaEstado(estado) {
  return el('span', { class: 'estado ' + estado, text: NOMES_ESTADO[estado] || estado });
}

function hora(comMilissegundos = false) {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  const base = `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
  return comMilissegundos ? `${base}.${String(d.getMilliseconds()).padStart(3, '0')}` : base;
}

async function obterJSON(url, opcoes) {
  const resposta = await fetch(url, opcoes);
  return { ok: resposta.ok, codigo: resposta.status, dados: await resposta.json() };
}

function enviarJSON(url, corpo) {
  return obterJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
}

function mostrarModo(modo) {
  const etiqueta = document.getElementById('modo');
  if (!etiqueta) return;
  etiqueta.textContent = modo === 'erro' ? 'Versão COM ERRO' : 'Versão CORRIGIDA';
  etiqueta.className = 'modo ' + modo;
}

function mostrarMensagem(texto, ok) {
  const caixa = document.getElementById('mensagem');
  caixa.textContent = texto;
  caixa.className = ok ? 'ok' : 'falha';
}

function mostrarLigacao(ligado) {
  const etiqueta = document.getElementById('ligacao');
  if (!etiqueta) return;
  etiqueta.textContent = ligado ? 'Socket: ligado' : 'Socket: desligado';
  etiqueta.className = 'ligacao ' + (ligado ? 'on' : 'off');
}

// Liga ao servidor por WebSocket (E3). Volta a ligar sozinho se a ligação cair.
function ligarSocket({ aoReceber, aoEnviar, aoMudarLigacao } = {}) {
  let socket = null;
  let proximoPedido = 1;
  const pendentes = new Map();

  function ligar() {
    const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${protocolo}://${location.host}/socket`);
    socket.onopen = () => aoMudarLigacao && aoMudarLigacao(true);
    socket.onclose = () => {
      aoMudarLigacao && aoMudarLigacao(false);
      for (const resolver of pendentes.values()) resolver({ ok: false, erro: 'A ligação ao servidor caiu.' });
      pendentes.clear();
      setTimeout(ligar, 2000);
    };
    socket.onmessage = (evento) => {
      let mensagem;
      try { mensagem = JSON.parse(evento.data); } catch { return; }
      aoReceber && aoReceber(mensagem, evento.data);
      if (mensagem.tipo === 'resposta' && pendentes.has(mensagem.pedidoId)) {
        pendentes.get(mensagem.pedidoId)(mensagem);
        pendentes.delete(mensagem.pedidoId);
      }
    };
  }
  ligar();

  return {
    // Envia uma mensagem e espera pela resposta do servidor
    enviar(objeto) {
      return new Promise((resolver) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          resolver({ ok: false, erro: 'Sem ligação ao servidor.' });
          return;
        }
        const mensagem = { ...objeto, pedidoId: proximoPedido++ };
        const texto = JSON.stringify(mensagem);
        pendentes.set(mensagem.pedidoId, resolver);
        aoEnviar && aoEnviar(mensagem, texto);
        socket.send(texto);
      });
    },
  };
}

// Mostra o modo no cabeçalho de qualquer página
obterJSON('/api/inventario').then((r) => mostrarModo(r.dados.modo)).catch(() => {});
