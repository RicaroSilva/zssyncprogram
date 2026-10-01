"""Gera apps/web/src/lib/zsgo/gerado/especificacao.json a partir de
docs/zsgo-api-1.3.yaml (a especificação OpenAPI do ZSGO): operações,
parâmetros e esquemas dos pedidos, já sem $ref. Correr quando houver uma
versão nova da API:  python3 scripts-zsgo-spec.py"""
import json, yaml, pathlib

base = pathlib.Path(__file__).parent
d = yaml.safe_load(open(base / "docs/zsgo-api-1.3.yaml"))
S = d["components"]["schemas"]

def resolver(s, prof=0):
    if prof > 12 or not isinstance(s, dict):
        return s
    if "$ref" in s:
        return resolver(S[s["$ref"].split("/")[-1]], prof + 1)
    r = {}
    for k in ("type", "enum", "format", "description", "required", "minimum", "maximum", "maxLength", "default", "example"):
        if k in s:
            r[k] = s[k]
    if "properties" in s:
        r["properties"] = {k: resolver(v, prof + 1) for k, v in s["properties"].items()}
    if "items" in s and isinstance(s["items"], dict):
        r["items"] = resolver(s["items"], prof + 1)
    for k in ("oneOf", "anyOf", "allOf"):
        if k in s:
            r[k] = [resolver(x, prof + 1) for x in s[k]]
    return r

ops = []
for caminho, metodos in d["paths"].items():
    for metodo, o in metodos.items():
        if metodo not in ("get", "post", "put", "patch", "delete"):
            continue
        corpo = None
        rb = o.get("requestBody")
        if rb:
            c = rb.get("content", {}).get("application/json", {}).get("schema")
            if c:
                corpo = resolver(c)
        ops.append({
            "metodo": metodo.upper(),
            "caminho": caminho,
            "resumo": o.get("summary") or "",
            "descricao": (o.get("description") or "")[:2000],
            "etiqueta": (o.get("tags") or [""])[0],
            "parametros": [
                {"nome": p["name"], "em": p["in"], "obrigatorio": p.get("required", False),
                 "descricao": p.get("description", ""), "esquema": resolver(p.get("schema", {}))}
                for p in o.get("parameters", []) if "name" in p
            ],
            "corpo": corpo,
            "respostas": sorted(o.get("responses", {}).keys()),
        })

saida = base / "apps/web/src/lib/zsgo/gerado/especificacao.json"
saida.write_text(json.dumps({"versao": "1.3", "servidor": d.get("servers", [{}])[0].get("url"), "operacoes": ops}, ensure_ascii=False, indent=1))
print(len(ops), "operações →", saida, saida.stat().st_size // 1024, "KB")
