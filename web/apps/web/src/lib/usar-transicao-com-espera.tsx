"use client";

import { useEffect, useState, useTransition, type ReactElement } from "react";
import { OverlayAguardar } from "@/components/overlay-aguardar";

const ATRASO_MS = 500;

/** Substituto direto de `useTransition()` — mesma assinatura
 *  `[pendente, iniciarTransicao]`, mais um terceiro elemento a colocar
 *  algures no JSX devolvido (a posição não importa, é um portal): o popup
 *  "a aguardar" que aparece automaticamente quando `pendente` continua
 *  verdadeiro passados 500 ms (nunca antes disso, para não piscar em
 *  ações rápidas). Usar em qualquer formulário que importe um ficheiro ou
 *  grave um dado. */
export function usarTransicaoComEspera(mensagem?: string): [boolean, (callback: () => void | Promise<void>) => void, ReactElement | null] {
  const [pendente, iniciarTransicao] = useTransition();
  const [mostrarAviso, setMostrarAviso] = useState(false);

  useEffect(() => {
    if (!pendente) {
      setMostrarAviso(false);
      return;
    }
    const temporizador = setTimeout(() => setMostrarAviso(true), ATRASO_MS);
    return () => clearTimeout(temporizador);
  }, [pendente]);

  const aviso = mostrarAviso ? <OverlayAguardar mensagem={mensagem} /> : null;
  return [pendente, iniciarTransicao, aviso];
}
