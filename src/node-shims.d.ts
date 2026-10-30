// O vite.config.ts usa dois módulos do Node no build (sem @types/node no projeto): só o que se usa.
declare module 'node:fs' {
  const fs: { existsSync(p: string): boolean; readFileSync(p: string, enc: 'utf8'): string; writeFileSync(p: string, data: string): void };
  export default fs;
}
declare module 'node:crypto' {
  export function createHash(alg: string): { update(s: string): { digest(enc: 'hex'): string } };
}
