import crypto from 'crypto';

// Só o hash fica no banco — o valor bruto só existe na resposta ao client. Se o
// banco vazar, o valor salvo não é utilizável pra sequestrar sessão, resetar
// senha ou reivindicar um convite. Todo token/código sensível persistido usa isto.
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
