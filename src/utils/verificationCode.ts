import crypto from 'crypto';
import { hashToken } from './hashToken';

export const VERIFICATION_CODE_TTL_MS = 15 * 60_000;
// Depois disso o código é invalidado e a pessoa precisa pedir um novo.
export const VERIFICATION_MAX_ATTEMPTS = 5;
// Intervalo mínimo entre dois envios pro mesmo email (evita usar o "reenviar" pra
// encher a caixa de alguém).
export const VERIFICATION_RESEND_COOLDOWN_MS = 60_000;

// randomInt (CSPRNG), não Math.random — e com zeros à esquerda: "004821" é um código válido.
export function generateVerificationCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Amarra o hash ao usuário: o mesmo código "123456" gera hashes diferentes pra usuários
// diferentes, então um vazamento do banco não vira uma tabela de consulta única.
export function hashVerificationCode(userId: number, code: string): string {
  return hashToken(`${userId}:${code}`);
}
