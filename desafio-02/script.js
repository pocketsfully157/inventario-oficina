// script.js — O que corre no browser do cliente

const zonaProdutos = document.getElementById("produtos");
const zonaMensagem = document.getElementById("mensagem");

// Pede ao servidor a lista de equipamentos e mostra-a na página
async function carregarProdutos() {
  const resposta = await fetch("/produtos");
  const equipamentos = await resposta.json();

  zonaProdutos.innerHTML = "";

  for (const equipamento of equipamentos) {
    const cartao = document.createElement("article");
    cartao.className = "produto";
    cartao.innerHTML =
      "<h2>" + equipamento.nome + "</h2>" +
      '<p class="serie">' + equipamento.numeroSerie + "</p>" +
      '<p class="preco">' + equipamento.preco + " €</p>" +
      '<p class="estado">' + equipamento.estado + "</p>";

    const botao = document.createElement("button");
    botao.textContent = "Comprar";
    botao.disabled = equipamento.estado !== "pronto";
    botao.addEventListener("click", () => comprar(equipamento.numeroSerie));
    cartao.appendChild(botao);

    zonaProdutos.appendChild(cartao);
  }
}

// Envia ao servidor o pedido de compra de um equipamento
async function comprar(numeroSerie) {
  const resposta = await fetch("/comprar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numeroSerie: numeroSerie }),
  });
  const dados = await resposta.json();

  mostrarMensagem(dados.mensagem, resposta.ok);
  carregarProdutos(); // volta a pedir a lista para mostrar o estado atual
}

function mostrarMensagem(texto, sucesso) {
  zonaMensagem.textContent = texto;
  zonaMensagem.className = "mensagem " + (sucesso ? "sucesso" : "erro");
}

carregarProdutos();
