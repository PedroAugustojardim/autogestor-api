import { z } from 'zod';

// Mensagens de validação em português, com o nome do campo. O app mostra `details` da
// resposta 400 direto pro usuário — sem isto, as mensagens padrão do Zod chegavam em inglês
// e sem contexto ("Number must be less than or equal to 99999999.99", sem dizer qual campo).
// Mensagem passada explicitamente no schema (ex.: 'O valor deve ser maior que zero')
// continua valendo: o error map só cobre o que não tem mensagem própria.
const FIELD_LABELS: Record<string, string> = {
  valor: 'Valor', data: 'Data', dataPrevista: 'Data prevista', kmAtual: 'KM', km: 'KM',
  litros: 'Litros', precoLitro: 'Preço por litro', custo: 'Custo', descricao: 'Observação',
  tipoCombustivel: 'Combustível', categoryId: 'Categoria', tipo: 'Tipo', marca: 'Marca',
  modelo: 'Modelo', ano: 'Ano', cor: 'Cor', apelido: 'Apelido', placa: 'Placa', renavam: 'RENAVAM',
  name: 'Nome', email: 'Email', password: 'Senha', newPassword: 'Nova senha',
  currentPassword: 'Senha atual', inviteCode: 'Código de convite', code: 'Código', token: 'Código',
  quantidade: 'Quantidade', diasValidade: 'Validade (dias)', plano: 'Plano',
};

const groupedNumber = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

// 99999999.99 → "99.999.999,99", 999.999 → "999,999". Números pequenos ficam sem separador de
// milhar pra não virar "1.900" num ano.
function formatLimit(value: number | bigint): string {
  const n = Number(value);
  return Math.abs(n) >= 100_000 ? groupedNumber.format(n) : String(n).replace('.', ',');
}

z.setErrorMap((issue, ctx) => {
  const last = issue.path[issue.path.length - 1];
  const label = last !== undefined ? FIELD_LABELS[String(last)] : undefined;
  const prefix = label ? `${label}: ` : '';

  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: `${prefix}${issue.received === 'undefined' ? 'campo obrigatório' : 'valor em formato inválido'}` };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: `${prefix}mínimo de ${issue.minimum} caractere(s)` };
      if (issue.type === 'number') {
        return { message: `${prefix}deve ser ${issue.inclusive ? 'no mínimo' : 'maior que'} ${formatLimit(issue.minimum)}` };
      }
      break;
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `${prefix}máximo de ${issue.maximum} caracteres` };
      if (issue.type === 'number') {
        return { message: `${prefix}deve ser ${issue.inclusive ? 'no máximo' : 'menor que'} ${formatLimit(issue.maximum)}` };
      }
      break;
    case z.ZodIssueCode.invalid_string:
      return { message: issue.validation === 'email' ? 'Email inválido' : `${prefix}formato inválido` };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `${prefix}valor não permitido` };
  }
  return { message: ctx.defaultError };
});
