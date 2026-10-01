import { rotulo } from "@/lib/zsgo/rotulos";
import { formatarValor, pareceData, pareceDinheiro } from "./formatar";

/**
 * Mostra qualquer objeto devolvido pelo ZSGO de forma legível: campos
 * simples numa grelha, objetos em secções e listas de objetos em tabela.
 * A API não descreve as respostas, por isso mostra-se tudo o que vier.
 */
type Obj = Record<string, unknown>;

function simples(v: unknown): boolean {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

function formatar(chave: string, v: unknown): string {
  if (pareceDinheiro(chave) && typeof v !== "boolean") return formatarValor(v, "euro");
  if (pareceData(chave, v)) return formatarValor(v, "data") + (typeof v === "string" && v.length > 10 ? ` ${v.slice(11, 16)}` : "");
  return formatarValor(v);
}

function Tabela({ itens }: { itens: Obj[] }) {
  const colunas = [...new Set(itens.flatMap((i) => Object.entries(i).filter(([, v]) => simples(v) || (v && typeof v === "object" && !Array.isArray(v))).map(([k]) => k)))].slice(0, 10);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            {colunas.map((c) => (
              <th key={c} className="py-2 pr-4 font-semibold">
                {rotulo(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((item, i) => (
            <tr key={i} className="border-b border-border align-top">
              {colunas.map((c) => {
                const v = item[c];
                const texto =
                  v && typeof v === "object" && !Array.isArray(v)
                    ? Object.entries(v as Obj)
                        .filter(([, x]) => simples(x) && x !== null && x !== "")
                        .map(([k, x]) => `${rotulo(k)}: ${formatar(k, x)}`)
                        .join(" · ")
                    : formatar(c, v);
                return (
                  <td key={c} className={pareceDinheiro(c) ? "py-2 pr-4 text-right tabular-nums" : "py-2 pr-4"}>
                    {texto || "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VistaObjeto({ dados, nivel = 0 }: { dados: unknown; nivel?: number }) {
  if (Array.isArray(dados)) {
    if (dados.every((x) => x && typeof x === "object" && !Array.isArray(x))) return <Tabela itens={dados as Obj[]} />;
    return <p className="text-sm">{dados.map((x) => formatarValor(x)).join(", ") || "—"}</p>;
  }
  if (!dados || typeof dados !== "object") return <p className="text-sm">{formatarValor(dados)}</p>;
  const entradas = Object.entries(dados as Obj);
  const campos = entradas.filter(([, v]) => simples(v));
  const compostos = entradas.filter(([, v]) => !simples(v) && !(Array.isArray(v) && v.length === 0));
  return (
    <div className="space-y-5">
      {campos.length > 0 && (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {campos.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rotulo(k)}</dt>
              <dd className="mt-0.5 break-words text-sm">
                {typeof v === "string" && /^https?:\/\//.test(v) ? (
                  <a href={v} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    Abrir
                  </a>
                ) : (
                  formatar(k, v)
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {compostos.map(([k, v]) => (
        <section key={k} className={nivel === 0 ? "rounded-lg border border-border p-4" : "border-l-2 border-border pl-4"}>
          <h3 className="mb-3 text-sm font-semibold">{rotulo(k)}</h3>
          <VistaObjeto dados={v} nivel={nivel + 1} />
        </section>
      ))}
    </div>
  );
}
