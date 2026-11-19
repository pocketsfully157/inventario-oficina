// analise-vendas.js — E5: as vendas ao longo do ano e o modelo periódico
// Uso:  node analise-vendas.js
// Lê dados/vendas.csv, ajusta o modelo  V(t) = D + A · cos(2π (t − t0) / 12)
// e compara-o com as vendas reais. Não precisa do servidor a correr.

const fs = require("fs");

const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const LIMITE = 0.1; // diferença a partir da qual dizemos que o modelo se afasta dos dados (10%)

// ---------- Ler o ficheiro CSV ----------
const linhas = fs.readFileSync("dados/vendas.csv", "utf-8").trim().split("\n").slice(1);
const dados = linhas.map((linha) => {
  const [mes, vendas, anuladas] = linha.split(",");
  return { mes: mes, t: Number(mes.slice(5)), vendas: Number(vendas), anuladas: Number(anuladas) };
});

// ---------- Ajustar o modelo ----------
// D  = média de todas as vendas
// A  = amplitude (quanto sobe e desce)      } calculados com o primeiro harmónico de Fourier,
// t0 = mês do pico                          } que é o cosseno de período 12 que melhor se ajusta
const n = dados.length;
const D = dados.reduce((soma, d) => soma + d.vendas, 0) / n;
let a = 0;
let b = 0;
for (const d of dados) {
  a += (d.vendas - D) * Math.cos((2 * Math.PI * d.t) / 12);
  b += (d.vendas - D) * Math.sin((2 * Math.PI * d.t) / 12);
}
a = (a * 2) / n;
b = (b * 2) / n;
const A = Math.sqrt(a * a + b * b);
let t0 = (Math.atan2(b, a) * 12) / (2 * Math.PI);
if (t0 <= 0) t0 += 12;

function modelo(t) {
  return D + A * Math.cos((2 * Math.PI * (t - t0)) / 12);
}

// ---------- Mostrar resultados ----------
const mesPico = Math.round(t0) % 12 || 12;
const mesVale = ((mesPico + 5) % 12) + 1;

console.log("\nMODELO:  V(t) = " + D.toFixed(1) + " + " + A.toFixed(1) + " · cos(2π (t − " + t0.toFixed(2) + ") / 12)");
console.log("  t  = mês do ano (1 = janeiro … 12 = dezembro)");
console.log("  D  = " + D.toFixed(1) + "  média de vendas por mês");
console.log("  A  = " + A.toFixed(1) + "  amplitude: as vendas variam entre cerca de " + Math.round(D - A) + " e " + Math.round(D + A));
console.log("  12 = período: o padrão repete-se todos os anos");
console.log("  t0 = " + t0.toFixed(2) + "  pico perto de " + NOMES[mesPico - 1] + ", mínimo perto de " + NOMES[mesVale - 1] + "\n");

console.log("Mês       Vendas  Modelo  Diferença  Anuladas  Taxa anulação");
for (const d of dados) {
  const previsto = modelo(d.t);
  const diferenca = (d.vendas - previsto) / previsto;
  const aviso = Math.abs(diferenca) > LIMITE ? "  <- afasta-se do modelo" : "";
  console.log(
    d.mes.padEnd(10) +
      String(d.vendas).padStart(6) +
      previsto.toFixed(1).padStart(8) +
      ((diferenca > 0 ? "+" : "") + Math.round(diferenca * 100) + "%").padStart(11) +
      String(d.anuladas).padStart(10) +
      ((d.anuladas / d.vendas) * 100).toFixed(1).padStart(14) + "%" +
      aviso
  );
}

// ---------- E5b: vendas anuladas no pico e fora dele ----------
const pico = dados.filter((d) => modelo(d.t) >= D);
const foraDoPico = dados.filter((d) => modelo(d.t) < D);
function resumo(grupo) {
  const vendas = grupo.reduce((s, d) => s + d.vendas, 0);
  const anuladas = grupo.reduce((s, d) => s + d.anuladas, 0);
  return { meses: grupo.length, vendas: vendas, anuladas: anuladas, taxa: (anuladas / vendas) * 100 };
}
const p = resumo(pico);
const f = resumo(foraDoPico);

console.log("\nVENDAS ANULADAS");
console.log("  Meses de pico (modelo acima da média):  " + p.anuladas + " anuladas em " + p.vendas + " vendas (" + p.taxa.toFixed(1) + "%) — média " + (p.anuladas / p.meses).toFixed(1) + " por mês");
console.log("  Meses fora do pico:                     " + f.anuladas + " anuladas em " + f.vendas + " vendas (" + f.taxa.toFixed(1) + "%) — média " + (f.anuladas / f.meses).toFixed(1) + " por mês\n");
