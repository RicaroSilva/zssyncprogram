import { NextResponse } from "next/server";
import { terminarSessaoAtual } from "@/lib/auth";
import { urlAbsoluto } from "@/lib/http";

export async function POST(request: Request) {
  await terminarSessaoAtual();
  return NextResponse.redirect(urlAbsoluto("/login", request), { status: 303 });
}
