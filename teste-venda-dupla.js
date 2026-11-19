// =============================================================
//  Teste: duas vendas do MESMO equipamento ao mesmo tempo
//  (o servidor tem de estar a correr noutra janela)
//
//    node teste-venda-dupla.js
// =============================================================

const BASE = process.env.BASE || 'http://localhost:3000';

async function vender(id, cliente) {
  const resposta = await fetch(`${BASE}/api/vender`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, cliente }),
  });
  return { codigo: resposta.status, corpo: await resposta.json() };
}

(async () => {
  await fetch(`${BASE}/api/repor`, { method: 'POST' });
  const { modo } = await (await fetch(`${BASE}/api/inventario`)).json();

  console.log(`\nModo do servidor: ${modo.toUpperCase()}`);
  console.log('Dois clientes compram o equipamento 1042 ao mesmo tempo (C-205 e C-207)...\n');

  const [a, b] = await Promise.all([vender(1042, 'C-205'), vender(1042, 'C-207')]);
  for (const [cliente, r] of [['C-205', a], ['C-207', b]]) {
    console.log(`  ${cliente}: HTTP ${r.codigo} — ${r.corpo.mensagem || r.corpo.erro}`);
  }

  const { inventario } = await (await fetch(`${BASE}/api/inventario`)).json();
  const linha = inventario.find((e) => e.id === 1042);
  console.log('\nLinha 1042 no inventário:');
  console.log(`  estado=${linha.estado}  dataVenda=${linha.dataVenda}  cliente=${linha.cliente}`);

  const vendas = await (await fetch(`${BASE}/api/vendas`)).json();
  const aceites = vendas.filter((v) => v.id === 1042 && v.resultado === 'aceite');

  console.log('');
  if (aceites.length > 1) {
    console.log(`⚠  VENDA DUPLICADA: ${aceites.length} vendas aceites para o mesmo computador.`);
    console.log(`   O cliente ${aceites[0].cliente} pagou, mas o inventário diz ${linha.cliente}.`);
  } else {
    console.log('✔  Só uma venda foi aceite. A outra foi recusada.');
  }
  console.log('');
})().catch((erro) => {
  console.error('Não foi possível ligar ao servidor. Ele está a correr? (node server.js erro|corrigido)');
  console.error(erro.message);
  process.exit(1);
});
