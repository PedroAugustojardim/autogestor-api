// dataPrevista e todayStr são ambos 'YYYY-MM-DD' — comparação lexicográfica de string
// ISO já é comparação cronológica correta, sem precisar parsear pra Date.
export function isOverdue(dataPrevista: string, todayStr: string): boolean {
  return dataPrevista < todayStr;
}
