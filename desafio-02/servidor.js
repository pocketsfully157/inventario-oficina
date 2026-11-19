// servidor.js — Servidor da loja Inforlândia
// Arrancar com:  node servidor.js
// Abrir no browser:  http://localhost:3000

const http = require("http");
const fs = require("fs");

const PORTA = 3000;
const FICHEIRO_INVENTARIO = "inventario.json";

// ---------- Inventário (ficheiro inventario.json) ----------

// Lê o inventário do ficheiro e devolve uma lista de equipamentos
function lerInventario() {
  const texto = fs.readFileSync(FICHEIRO_INVENTARIO, "utf-8");
  return JSON.parse(texto);
}

// Guarda a lista de equipamentos no ficheiro
function guardarInventario(equipamentos) {
  fs.writeFileSync(FICHEIRO_INVENTARIO, JSON.stringify(equipamentos, null, 2));
}

// ---------- Ações do servidor ----------

// Devolve a lista de equipamentos ao site
function listarProdutos(resposta) {
  responderJSON(resposta, 200, lerInventario());
}

// Trata uma compra: o site envia o número de série do equipamento que o cliente quer comprar
// Estados possíveis de um equipamento: "em reparação", "pronto" e "vendido"
function comprar(numeroSerie, resposta) {
  const equipamentos = lerInventario();
  const equipamento = equipamentos.find((e) => e.numeroSerie === numeroSerie);

  if (!equipamento) {
    responderJSON(resposta, 404, { mensagem: "Esse equipamento não existe." });
    return;
  }

  if (equipamento.estado !== "pronto") {
    responderJSON(resposta, 409, { mensagem: "Indisponível: o equipamento está " + equipamento.estado + "." });
    return;
  }

  // CORREÇÃO: depois de vender, o estado tem de passar a "vendido" e ficar guardado no ficheiro.
  // Antes, a compra era aceite mas o inventário ficava igual ("pronto"), por isso o mesmo
  // equipamento podia ser vendido outra vez. Como a leitura, a verificação e a gravação são
  // síncronas (sem await pelo meio), nenhuma outra compra consegue entrar a meio deste processo.
  equipamento.estado = "vendido";
  guardarInventario(equipamentos);

  responderJSON(resposta, 200, { mensagem: "Compra efetuada: " + equipamento.nome });
}

// ---------- Servidor ----------

const servidor = http.createServer((pedido, resposta) => {
  console.log(pedido.method + " " + pedido.url);

  if (pedido.method === "GET" && pedido.url === "/") {
    enviarFicheiro(resposta, "index.html", "text/html");
  } else if (pedido.method === "GET" && pedido.url === "/script.js") {
    enviarFicheiro(resposta, "script.js", "text/javascript");
  } else if (pedido.method === "GET" && pedido.url === "/style.css") {
    enviarFicheiro(resposta, "style.css", "text/css");
  } else if (pedido.method === "GET" && pedido.url === "/produtos") {
    listarProdutos(resposta);
  } else if (pedido.method === "POST" && pedido.url === "/comprar") {
    // O corpo do pedido chega aos poucos; juntamos tudo antes de o usar
    let corpo = "";
    pedido.on("data", (parte) => (corpo += parte));
    pedido.on("end", () => {
      try {
        comprar(JSON.parse(corpo).numeroSerie, resposta);
      } catch (erro) {
        responderJSON(resposta, 400, { mensagem: "Pedido inválido." });
      }
    });
  } else {
    responderJSON(resposta, 404, { mensagem: "Página não encontrada." });
  }
});

servidor.listen(PORTA, () => {
  console.log("Servidor a correr em http://localhost:" + PORTA);
});

// ---------- Funções auxiliares ----------

function enviarFicheiro(resposta, nome, tipo) {
  resposta.writeHead(200, { "Content-Type": tipo + "; charset=utf-8" });
  resposta.end(fs.readFileSync(nome));
}

function responderJSON(resposta, codigo, dados) {
  resposta.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  resposta.end(JSON.stringify(dados));
}
