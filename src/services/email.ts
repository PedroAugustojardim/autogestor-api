import { Resend } from 'resend';
import * as dotenv from 'dotenv';

// Carrega o .env aqui também: este módulo lê process.env.* já na importação
// (linha abaixo), então não pode depender de outro módulo (ex.: config/database.ts)
// ter sido importado antes pra garantir que o .env já foi carregado.
dotenv.config();

// Sem RESEND_API_KEY (ex.: dev local sem conta Resend configurada), cai no fallback de
// console.log — igual ao comportamento anterior — em vez de derrubar o fluxo de reset de senha.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL || 'AutoGestor <onboarding@resend.dev>';

// tipo/apelido do veículo são texto livre do usuário — nunca interpolar direto no
// HTML do email sem escapar (mesmo padrão do escapeHtml usado no PDF do mobile).
function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  if (!resend) {
    console.log(`[DEV] RESEND_API_KEY não configurada — reset token para ${to}: ${token}`);
    return;
  }

  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Redefinir senha — AutoGestor',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1B5E20;">Redefinir senha</h2>
        <p>Você pediu para redefinir a senha da sua conta AutoGestor. Abra o app, toque em
           "Já tenho um código" na tela de recuperação de senha e cole o código abaixo:</p>
        <p style="background: #F1F8E9; border-radius: 8px; padding: 16px; font-family: monospace;
                   font-size: 14px; word-break: break-all;">${token}</p>
        <p style="color: #757575; font-size: 13px;">Esse código expira em 1 hora. Se você não pediu
           essa redefinição, pode ignorar este email com segurança.</p>
      </div>
    `,
  });
}

export async function sendReminderEmail(
  to: string,
  reminder: { tipo: string; dataPrevista: string },
  vehicleLabel: string,
  atrasado: boolean,
): Promise<void> {
  const tipo = escapeHtml(reminder.tipo);
  const veiculo = escapeHtml(vehicleLabel);
  const data = formatDateBR(reminder.dataPrevista);

  if (!resend) {
    console.log(`[DEV] RESEND_API_KEY não configurada — lembrete "${reminder.tipo}" (${veiculo}, ${data}) para ${to}`);
    return;
  }

  await resend.emails.send({
    from: FROM,
    to,
    subject: atrasado ? `Lembrete atrasado — ${reminder.tipo}` : `Lembrete próximo — ${reminder.tipo}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1B5E20;">${atrasado ? '⚠️ Lembrete atrasado' : '🔧 Lembrete de manutenção'}</h2>
        <p><strong>${tipo}</strong> — ${veiculo}</p>
        <p style="color: ${atrasado ? '#C62828' : '#424242'};">
          ${atrasado ? 'Estava previsto para' : 'Previsto para'} <strong>${data}</strong>.
        </p>
        <p style="color: #757575; font-size: 13px;">Abra o app AutoGestor para marcar como feito ou silenciar
           este lembrete. Você continuará recebendo este aviso semanalmente até lá.</p>
      </div>
    `,
  });
}
