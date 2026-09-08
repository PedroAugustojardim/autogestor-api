import { reminderQueue } from '../config/redis';
import { AppDataSource } from '../config/database';
import { Reminder } from '../entities/Reminder';
import { Notification } from '../entities/Notification';
import { sendReminderEmail, formatDateBR } from '../services/email';
import { isOverdue } from '../utils/reminders';

const JOB_NAME = 'check-due-reminders';
const NOTIFY_WINDOW_DAYS = 30; // começa a avisar a partir de 30 dias antes da data prevista
const RENOTIFY_COOLDOWN_DAYS = 7; // depois do primeiro aviso, repete no máximo 1x/semana

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function checkDueReminders(): Promise<void> {
  const reminderRepo = AppDataSource.getRepository(Reminder);

  // Cobre "vencendo em até 30 dias" e "já vencido" com uma única condição, já que
  // uma data vencida sempre é <= hoje + 30 dias. notificationsEnabled=false já
  // exclui o usuário aqui — a preferência do Perfil vale tanto pro email quanto
  // pra notificação in-app, não só decorativa como antes.
  const due = await reminderRepo
    .createQueryBuilder('r')
    .innerJoinAndSelect('r.vehicle', 'vehicle')
    .innerJoinAndSelect('vehicle.user', 'user')
    .where('r.concluido = :concluido', { concluido: false })
    .andWhere('r.silenciado = :silenciado', { silenciado: false })
    .andWhere('user.notificationsEnabled = :notifEnabled', { notifEnabled: true })
    .andWhere('r.dataPrevista <= :cutoff', { cutoff: daysFromNow(NOTIFY_WINDOW_DAYS) })
    .andWhere('(r.lastNotifiedAt IS NULL OR r.lastNotifiedAt <= :cooldown)', { cooldown: daysAgo(RENOTIFY_COOLDOWN_DAYS) })
    .getMany();

  // Um snapshot só de "hoje" pro job inteiro — sem isso, um job que demora o
  // suficiente pra cruzar a meia-noite podia classificar lembretes de forma
  // inconsistente dependendo da posição no loop.
  const todayStr = new Date().toISOString().split('T')[0];

  for (const reminder of due) {
    const vehicleLabel = reminder.vehicle.apelido || `${reminder.vehicle.marca} ${reminder.vehicle.modelo}`;
    const atrasado = isOverdue(reminder.dataPrevista, todayStr);
    try {
      await sendReminderEmail(reminder.vehicle.user.email, reminder, vehicleLabel, atrasado);
      // Notificação in-app e lastNotifiedAt juntas numa transação: se a gravação da
      // notificação falhasse sozinha, lastNotifiedAt ficava sem atualizar e o mesmo
      // lembrete tomaria um segundo email duplicado no próximo dia.
      await AppDataSource.transaction(async (manager) => {
        await manager.save(Notification, manager.create(Notification, {
          userId: reminder.vehicle.user.id,
          tipo: 'lembrete',
          titulo: atrasado ? 'Lembrete atrasado' : 'Lembrete próximo',
          mensagem: `${reminder.tipo} — ${vehicleLabel}, previsto para ${formatDateBR(reminder.dataPrevista)}`,
        }));
        await manager.update(Reminder, reminder.id, { lastNotifiedAt: new Date() });
      });
    } catch (err) {
      // Uma falha de envio (ex.: Resend fora do ar) não pode travar os demais
      // lembretes do mesmo job — loga e segue pro próximo.
      console.error(`[reminderWorker] falha ao notificar lembrete ${reminder.id}:`, err);
    }
  }
}

export function startReminderWorker(): void {
  reminderQueue.process(JOB_NAME, checkDueReminders);

  // Job repetível — o jobId fixo faz o Bull deduplicar: reiniciar o processo com a
  // mesma config de repeat não cria uma segunda agenda. tz explícito porque o
  // servidor (Railway) roda em UTC por padrão — sem isso, "8h" seria 5h em SP.
  reminderQueue
    .add(JOB_NAME, {}, { repeat: { cron: '0 8 * * *', tz: 'America/Sao_Paulo' }, jobId: JOB_NAME })
    .catch((err) => console.error('[reminderWorker] falha ao agendar job repetível:', err.message));
}
