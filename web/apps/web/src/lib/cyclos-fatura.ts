import "server-only";
import { cfg } from "./config";

/**
 * Envia a fatura ao Cyclos (/web/run/invoice) — igual a
 * cyclos/CyclosInvoiceClient do Java: url_pdf, userid e invoicenumber
 * (tipo-número do ZSGO, ex. "FA-1231").
 */
export async function notificarFaturaCyclos(userId: string, urlPdf: string, numeroFatura: string): Promise<void> {
  const url = cfg("cyclos.invoice.url");
  const auth = Buffer.from(`${cfg("cyclos.invoice.user")}:${cfg("cyclos.invoice.password")}`).toString("base64");
  const resposta = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url_pdf: urlPdf, userid: Number(userId), invoicenumber: numeroFatura }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (resposta.status < 200 || resposta.status >= 300) {
    throw new Error(`Cyclos /web/run/invoice devolveu ${resposta.status}: ${await resposta.text()}`);
  }
}
