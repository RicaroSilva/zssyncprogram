/** Cores das séries nos gráficos (ordem fixa; ver --serie-* em globals.css). */
export const CORES_SERIES = ["var(--serie-1)", "var(--serie-2)", "var(--serie-3)", "var(--serie-4)", "var(--serie-5)"];
export const COR_OUTRAS = "var(--serie-outras)";

/** Cor da i-ésima maior série: as 5 primeiras têm cor própria, as restantes ficam em "Outras". */
export const corDaPosicao = (i: number) => CORES_SERIES[i] ?? COR_OUTRAS;
