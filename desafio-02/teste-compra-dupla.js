// teste-compra-dupla.js — Tenta comprar o mesmo equipamento duas vezes
// Com o servidor a correr noutro terminal:
//   node teste-compra-dupla.js              (compra o INF-0004)
//   node teste-compra-dupla.js INF-0001     (compra outro equipamento)
// Atenção: este teste altera o inventario.json. Para voltar ao início: node repor-inventario.js

const numeroSerie = process.argv[2] || "INF-0004";

async function comprar() {
  const resposta = await fetch("http://localhost:3000/comprar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numeroSerie: numeroSerie }),
  });
  const dados = await resposta.json();
  return resposta.status + " — " + dados.mensagem;
}

async function estadoAtual() {
  const resposta = await fetch("http://localhost:3000/produtos");
  const equipamentos = await resposta.json();
  const equipamento = equipamentos.find((e) => e.numeroSerie === numeroSerie);
  return equipamento ? equipamento.estado : "não existe";
}

async function main() {
  console.log("Equipamento:          " + numeroSerie);
  console.log("Estado antes:         " + (await estadoAtual()));

  // Dois clientes carregam em "Comprar" no mesmo instante
  const [a, b] = await Promise.all([comprar(), comprar()]);
  console.log("Cliente A:            " + a);
  console.log("Cliente B:            " + b);
  console.log("Estado depois:        " + (await estadoAtual()));

  // Um terceiro cliente, com a página antiga aberta, tenta comprar mais tarde
  console.log("Cliente C (depois):   " + (await comprar()));
  console.log("Estado final:         " + (await estadoAtual()));
}

main().catch(() => console.log("Não foi possível ligar ao servidor. Está a correr (node servidor.js)?"));
