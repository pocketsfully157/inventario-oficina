// repor-inventario.js — Volta a pôr o inventario.json como estava no início
// Uso:  node repor-inventario.js
// Copia dados/inventario-original.json por cima de inventario.json.
// Não é preciso reiniciar o servidor: ele lê o ficheiro em cada pedido.

const fs = require("fs");

fs.copyFileSync("dados/inventario-original.json", "inventario.json");
console.log("inventario.json reposto a partir de dados/inventario-original.json");
