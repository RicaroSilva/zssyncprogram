import "server-only";
import { prisma } from "../db";
import { descreverErro } from "../erros";
import { ZsgoApi, type ClienteOrigem } from "../zsgo/api";
import { CONTINENTE, regiaoDoCodigoPostal } from "../zsgo/regiao";
import { cfgOu } from "../config";
import { clientesOrigem } from "./fontes";
import type { Progresso } from "./progresso";

/** Mesmas regras de ClientListingRun/ClientVerifyService/SyncControlDao do Java. */

async function marcarSucesso(c: ClienteOrigem, code: string, respostaJson: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO zsgo_client_sync (user_id, zsgo_code, zsgo_dados, content_hash, status, tentativas, ultimo_erro, atualizado_em)
    VALUES (${BigInt(c.id)}, ${BigInt(code)}, ${respostaJson}::jsonb, ${c.contentHash}, 'SINCRONIZADO', 1, NULL, now())
    ON CONFLICT (user_id) DO UPDATE SET
      zsgo_code = EXCLUDED.zsgo_code,
      zsgo_dados = EXCLUDED.zsgo_dados,
      content_hash = EXCLUDED.content_hash,
      status = 'SINCRONIZADO',
      tentativas = zsgo_client_sync.tentativas + 1,
      ultimo_erro = NULL,
      atualizado_em = now()`;
}

async function marcarErroCriar(id: string, erro: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO zsgo_client_sync (user_id, status, tentativas, ultimo_erro, atualizado_em)
    VALUES (${BigInt(id)}, 'ERRO', 1, ${erro.slice(0, 2000)}, now())
    ON CONFLICT (user_id) DO UPDATE SET
      status = 'ERRO',
      tentativas = zsgo_client_sync.tentativas + 1,
      ultimo_erro = EXCLUDED.ultimo_erro,
      atualizado_em = now()`;
}

async function marcarErroAtualizar(id: string, erro: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE zsgo_client_sync SET ultimo_erro = ${erro.slice(0, 2000)}, tentativas = tentativas + 1, atualizado_em = now()
    WHERE user_id = ${BigInt(id)}`;
}

/** Cria no ZSGO os clientes indicados (os que a faturação precisa e ainda
 *  não têm zsgo_code). Devolve [criados, com erro, não encontrados]. */
export async function criarClientesEmFalta(ids: string[], progresso: Progresso): Promise<{ criados: number; erros: number; naoEncontrados: number }> {
  const zsgo = new ZsgoApi();
  const procurados = new Set(ids);
  progresso("A ler os dados atuais dos clientes no Cyclos…");
  const aCriar = (await clientesOrigem()).filter((c) => procurados.has(c.id));
  let criados = 0;
  let erros = 0;
  for (const [i, c] of aCriar.entries()) {
    progresso(`A criar ${c.nome ?? c.id} no ZSGO…`, i, aCriar.length);
    try {
      const r = await zsgo.criarCliente(c);
      await marcarSucesso(c, r.code, r.respostaJson);
      criados++;
    } catch (e) {
      await marcarErroCriar(c.id, `Falha ao criar no ZSGO (antes da faturação): ${descreverErro(e)}`);
      erros++;
    }
  }
  progresso(`${criados} criado(s), ${erros} com erro.`, aCriar.length, aCriar.length);
  return { criados, erros, naoEncontrados: procurados.size - aCriar.length };
}

export interface ClienteDesatualizado {
  id: string;
  zsgoCode: string;
  dadosAtuais: ClienteOrigem;
}

/** Clientes já no ZSGO cujos dados mudaram no Cyclos (content_hash
 *  diferente) ou cuja região no ZSGO não bate com o código postal. */
export async function verificarAlteracoes(progresso: Progresso): Promise<ClienteDesatualizado[]> {
  progresso("A ler os clientes já importados…");
  const importados = await prisma.$queryRaw<Array<{ user_id: bigint; zsgo_code: bigint | null; status: string; content_hash: string | null; region_code: string | null }>>`
    SELECT s.user_id, s.zsgo_code, s.status, s.content_hash, s.zsgo_dados->'data'->'address'->>'region_code' AS region_code
    FROM zsgo_client_sync s`;
  progresso("A ler os dados atuais no Cyclos (pode demorar, consoante o número de clientes)…");
  const atuais = new Map((await clientesOrigem()).map((c) => [c.id, c]));
  const mudaram: ClienteDesatualizado[] = [];
  for (const s of importados) {
    if (s.status !== "SINCRONIZADO" || s.zsgo_code === null) continue;
    const atual = atuais.get(s.user_id.toString());
    if (!atual) continue;
    const hashMudou = !!atual.contentHash && atual.contentHash !== s.content_hash;
    const certa = regiaoDoCodigoPostal(atual.pais, atual.codigoPostal);
    const gravada = s.region_code?.trim() ? s.region_code : CONTINENTE;
    const regiaoErrada = !!certa && certa.toUpperCase() !== gravada.toUpperCase();
    if (hashMudou || regiaoErrada) mudaram.push({ id: s.user_id.toString(), zsgoCode: s.zsgo_code.toString(), dadosAtuais: atual });
  }
  return mudaram;
}

export async function atualizarClientes(lista: ClienteDesatualizado[], progresso: Progresso): Promise<{ atualizados: number; erros: number }> {
  const zsgo = new ZsgoApi();
  let atualizados = 0;
  let erros = 0;
  for (const [i, c] of lista.entries()) {
    progresso(`A atualizar ${c.dadosAtuais.nome ?? c.id} (zsgo ${c.zsgoCode})…`, i, lista.length);
    try {
      const r = await zsgo.atualizarCliente(c.dadosAtuais, c.zsgoCode);
      await marcarSucesso(c.dadosAtuais, r.code, r.respostaJson);
      atualizados++;
    } catch (e) {
      await marcarErroAtualizar(c.id, `Falha ao ATUALIZAR no ZSGO: ${descreverErro(e)}`);
      erros++;
    }
  }
  progresso(`${atualizados} atualizado(s), ${erros} com erro.`, lista.length, lista.length);
  return { atualizados, erros };
}

/** Tarefa "Sincronizar clientes novos": cria no ZSGO os clientes pendentes
 *  da source.clients.query (igual a Main.runClientSync / ClientSyncService). */
export async function sincronizarClientesNovos(progresso: Progresso): Promise<{ criados: number; erros: number }> {
  if (cfgOu("sync.clients.enabled", "true").toLowerCase() === "false") {
    progresso("A sincronização de clientes está desligada (sync.clients.enabled=false).");
    return { criados: 0, erros: 0 };
  }
  const zsgo = new ZsgoApi();
  progresso("A ler os clientes por sincronizar…");
  const pendentes = await clientesOrigem("source.clients.query");
  let criados = 0;
  let erros = 0;
  for (const [i, c] of pendentes.entries()) {
    progresso(`A criar ${c.nome ?? c.id} no ZSGO…`, i, pendentes.length);
    try {
      const r = await zsgo.criarCliente(c);
      await marcarSucesso(c, r.code, r.respostaJson);
      criados++;
    } catch (e) {
      await marcarErroCriar(c.id, `${descreverErro(e)} | Dados enviados: ${JSON.stringify(c)}`);
      erros++;
    }
  }
  return { criados, erros };
}
