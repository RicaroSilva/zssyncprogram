/**
 * Região fiscal portuguesa a partir do código postal (address.region_code
 * no ZSGO), que determina as taxas de IVA — igual a util/RegiaoFiscal:
 *   9000–9499 → MA (Madeira e Porto Santo)
 *   9500–9999 → AC (Açores)
 *   restante  → CON (Continente)
 * Só para clientes de Portugal; para outros países devolve null.
 */
export const CONTINENTE = "CON";

export function regiaoDoCodigoPostal(pais: string | null | undefined, codigoPostal: string | null | undefined): string | null {
  if (pais && pais.trim() && pais.trim().toUpperCase() !== "PT") return null;
  if (!codigoPostal) return null;
  const digitos = codigoPostal.replace(/[^0-9]/g, "");
  if (digitos.length < 4) return null;
  const cp4 = Number(digitos.slice(0, 4));
  if (cp4 >= 9000 && cp4 <= 9499) return "MA";
  if (cp4 >= 9500 && cp4 <= 9999) return "AC";
  return CONTINENTE;
}
