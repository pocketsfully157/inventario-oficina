// =============================================================
//  Servidor WebSocket mínimo (sem bibliotecas externas)
//  Usado pela E3: é por aqui que as alterações feitas na
//  aplicação da oficina chegam ao servidor, e que o servidor
//  avisa todos os browsers ligados.
// =============================================================

const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'; // valor fixo definido pelo protocolo WebSocket
const TAMANHO_MAXIMO = 64 * 1024;                     // ignora mensagens maiores que 64 KB

function criarServidorWebSocket(servidorHttp, caminho, aoReceber, aoLigar) {
  const clientes = new Set();

  servidorHttp.on('upgrade', (pedido, socket) => {
    const url = new URL(pedido.url, 'http://localhost');
    const chave = pedido.headers['sec-websocket-key'];

    if (url.pathname !== caminho || String(pedido.headers.upgrade).toLowerCase() !== 'websocket' || !chave) {
      socket.destroy();
      return;
    }

    // "Aperto de mão": o browser pede para mudar de HTTP para WebSocket
    const aceitar = crypto.createHash('sha1').update(chave + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${aceitar}\r\n\r\n`
    );

    const cliente = {
      enviar(objeto) { enviarFrame(socket, 0x1, Buffer.from(JSON.stringify(objeto), 'utf8')); },
    };
    clientes.add(cliente);
    if (aoLigar) aoLigar(cliente);

    let pendente = Buffer.alloc(0);

    socket.on('data', (dados) => {
      pendente = Buffer.concat([pendente, dados]);
      while (true) {
        const frame = lerFrame(pendente);
        if (frame === null) break;          // ainda não chegou a mensagem toda
        if (frame === 'grande') { socket.destroy(); return; }
        pendente = pendente.subarray(frame.tamanhoTotal);

        if (frame.opcode === 0x8) {         // o browser fechou a ligação
          enviarFrame(socket, 0x8, Buffer.alloc(0));
          socket.end();
          clientes.delete(cliente);
          return;
        }
        if (frame.opcode === 0x9) {         // ping -> responde pong
          enviarFrame(socket, 0xA, frame.dados);
          continue;
        }
        if (frame.opcode === 0x1) {         // mensagem de texto (JSON)
          let mensagem;
          try { mensagem = JSON.parse(frame.dados.toString('utf8')); } catch { continue; }
          Promise.resolve(aoReceber(cliente, mensagem)).catch((erro) => console.error(erro));
        }
      }
    });

    socket.on('close', () => clientes.delete(cliente));
    socket.on('error', () => clientes.delete(cliente));
  });

  return {
    // Envia a mesma mensagem a todos os browsers ligados
    difundir(objeto) {
      for (const cliente of clientes) cliente.enviar(objeto);
    },
    numeroDeClientes() {
      return clientes.size;
    },
  };
}

function lerFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const mascarado = (buffer[1] & 0x80) !== 0;
  let tamanho = buffer[1] & 0x7f;
  let posicao = 2;

  if (tamanho === 126) {
    if (buffer.length < 4) return null;
    tamanho = buffer.readUInt16BE(2);
    posicao = 4;
  } else if (tamanho === 127) {
    if (buffer.length < 10) return null;
    tamanho = Number(buffer.readBigUInt64BE(2));
    posicao = 10;
  }
  if (tamanho > TAMANHO_MAXIMO) return 'grande';

  let mascara = null;
  if (mascarado) {
    if (buffer.length < posicao + 4) return null;
    mascara = buffer.subarray(posicao, posicao + 4);
    posicao += 4;
  }
  if (buffer.length < posicao + tamanho) return null;

  const dados = Buffer.from(buffer.subarray(posicao, posicao + tamanho));
  if (mascara) {
    for (let i = 0; i < dados.length; i++) dados[i] ^= mascara[i % 4];
  }
  return { opcode, dados, tamanhoTotal: posicao + tamanho };
}

function enviarFrame(socket, opcode, dados) {
  if (socket.destroyed) return;
  const tamanho = dados.length;
  let cabecalho;
  if (tamanho < 126) {
    cabecalho = Buffer.from([0x80 | opcode, tamanho]);
  } else if (tamanho < 65536) {
    cabecalho = Buffer.alloc(4);
    cabecalho[0] = 0x80 | opcode;
    cabecalho[1] = 126;
    cabecalho.writeUInt16BE(tamanho, 2);
  } else {
    cabecalho = Buffer.alloc(10);
    cabecalho[0] = 0x80 | opcode;
    cabecalho[1] = 127;
    cabecalho.writeBigUInt64BE(BigInt(tamanho), 2);
  }
  socket.write(Buffer.concat([cabecalho, dados]));
}

module.exports = { criarServidorWebSocket };
