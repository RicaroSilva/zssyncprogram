// Gera o valor de ADMIN_LOCAL_LOGIN_PASSWORD_HASH_B64 (acesso de emergência):
//   pnpm --filter @faturacao/web hash-senha "A-MINHA-SENHA"
import argon2 from "argon2";

const senha = process.argv[2];
if (!senha) {
  console.error('Uso: pnpm --filter @faturacao/web hash-senha "A-MINHA-SENHA"');
  process.exit(1);
}
const hash = await argon2.hash(senha, { type: argon2.argon2id });
console.log(Buffer.from(hash).toString("base64"));
