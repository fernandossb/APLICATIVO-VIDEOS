// Serviço local. As credenciais são fornecidas pelo ambiente do processo.
const { Client } = require(process.env.COSTURAFLOW_WEB + '/node_modules/pg');
const { createClient } = require(process.env.COSTURAFLOW_WEB + '/node_modules/@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
});

async function consultar(numero) {
  const db = new Client({ host: '192.168.1.4', port: 5432, database: '13563P', user: 'sisplan',
    password: process.env.ERP_DB_PASSWORD, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('BEGIN READ ONLY');
    await db.query("SET LOCAL statement_timeout = '15s'");
    const ordem = await db.query('select codigo from sisplan.of1_001 where numero = $1', [numero]);
    if (ordem.rowCount !== 1) return { encontrado: false };
    const produto = await db.query('select descricao from sisplan.produto_001 where codigo = $1 limit 2', [ordem.rows[0].codigo]);
    if (produto.rowCount !== 1) throw new Error('Produto ausente ou duplicado no SISPLAN');
    const grade = await db.query(`select i.cor, coalesce(c.descricao, i.cor) as cor_nome, i.tam, i.qtde
      from sisplan.of_iten_001 i left join lateral
      (select descricao from sisplan.cadcor_001 where cor = i.cor limit 1) c on true
      where i.numero = $1 order by i.cor, i.tam`, [numero]);
    const faccoes = await db.query(`select distinct f.codcli as codigo, e.nome
      from sisplan.faccao_001 f join sisplan.entidade_001 e on e.codcli = f.codcli
      where f.numero = $1 and nullif(trim(e.nome), '') is not null order by e.nome`, [numero]);
    return { encontrado: true, codigo: ordem.rows[0].codigo, descricao: produto.rows[0].descricao, grade: grade.rows, faccoes: faccoes.rows };
  } finally {
    await db.query('ROLLBACK').catch(() => {});
    await db.end();
  }
}

async function iniciar() {
  const { error } = await supabase.auth.signInWithPassword({ email: process.env.CONNECTOR_EMAIL, password: process.env.CONNECTOR_PASSWORD });
  if (error) throw error;
  console.log('Conector SISPLAN iniciado');
  while (true) {
    try {
      const { data, error: erroFila } = await supabase.rpc('conector_proxima_op');
      if (erroFila) throw erroFila;
      for (const pedido of data || []) {
        let resultado;
        let falhou = false;
        try { resultado = await consultar(pedido.numero); }
        catch (erro) { console.error('Consulta SISPLAN:', erro.message); resultado = { mensagem: 'Falha ao consultar o SISPLAN.' }; falhou = true; }
        const { error: erroResposta } = await supabase.rpc('conector_responder_op', { p_id: pedido.id, p_resultado: resultado, p_erro: falhou });
        if (erroResposta) throw erroResposta;
      }
    } catch (erro) { console.error('Conector:', erro.message); }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
iniciar().catch((erro) => { console.error('Erro de inicialização:', erro.message); process.exit(1); });
