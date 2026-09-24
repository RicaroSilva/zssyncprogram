#!/usr/bin/env bash
# Compila o código em src/ e gera zsgo-client-sync.jar (jar único, com as
# dependências de lib/dependencias.jar lá dentro: driver PostgreSQL, FlatLaf).
# Alvo Java 17, que é a versão instalada na máquina onde o painel corre.
set -euo pipefail
cd "$(dirname "$0")"

BUILD=build
rm -rf "$BUILD"
mkdir -p "$BUILD/classes" "$BUILD/jar"

javac -encoding UTF-8 --release 17 -nowarn \
  -cp lib/dependencias.jar \
  -d "$BUILD/classes" $(find src -name '*.java')

(cd "$BUILD/jar" && jar --extract --file ../../lib/dependencias.jar)
cp -r "$BUILD/classes/." "$BUILD/jar/"
cp -r resources/. "$BUILD/jar/"
rm -f "$BUILD/jar/META-INF/MANIFEST.MF"

jar --create --file zsgo-client-sync.jar --main-class pt.zsgosync.Main -C "$BUILD/jar" .
rm -rf "$BUILD"
echo "OK: zsgo-client-sync.jar gerado."
