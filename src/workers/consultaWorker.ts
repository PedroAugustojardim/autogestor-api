import { consultaQueue } from '../config/redis';
import { AppDataSource } from '../config/database';
import { Vehicle } from '../entities/Vehicle';
import { Notification } from '../entities/Notification';
import { getConsultaProvider } from '../services/consulta';
import { sendPushNotification } from '../services/pushNotification';

const JOB_NAME = 'check-fines';

async function checkFinesForPremiumVehicles(): Promise<void> {
  const vehicleRepo = AppDataSource.getRepository(Vehicle);

  // Só veículos Premium com placa cadastrada — sem placa não dá pra consultar
  // nada (a API do órgão consulta por placa), e o plano gratuito não tem acesso.
  const vehicles = await vehicleRepo
    .createQueryBuilder('v')
    .innerJoinAndSelect('v.user', 'user')
    .where('v.placa IS NOT NULL')
    .andWhere('user.plano != :gratuito', { gratuito: 'gratuito' })
    .getMany();

  const provider = getConsultaProvider();

  for (const vehicle of vehicles) {
    try {
      const fines = await provider.getFines(vehicle.placa!);
      const previousCount = vehicle.lastKnownFineCount;

      // null = primeira checagem deste veículo — só notifica se já nascer com multa,
      // não é "nova" nesse caso específico, é só o estado inicial sendo registrado.
      const isNewFine = previousCount !== null && fines.length > previousCount;

      if (isNewFine) {
        const vehicleLabel = vehicle.apelido || `${vehicle.marca} ${vehicle.modelo}`;
        const notificationRepo = AppDataSource.getRepository(Notification);
        await notificationRepo.save(notificationRepo.create({
          userId: vehicle.userId,
          tipo: 'multa',
          titulo: 'Nova multa encontrada',
          mensagem: `${vehicleLabel} (${vehicle.placa}) tem ${fines.length} multa(s) registrada(s).`,
        }));

        if (vehicle.user.fcmToken) {
          await sendPushNotification(
            vehicle.user.fcmToken,
            'Nova multa encontrada',
            `${vehicleLabel} (${vehicle.placa}) tem uma nova multa. Toque para ver detalhes.`,
          );
        }
      }

      await vehicleRepo.update(vehicle.id, {
        lastKnownFineCount: fines.length,
        lastFineCheckAt: new Date(),
      });
    } catch (err) {
      // Provider fora do ar pra uma placa não pode travar a checagem das demais.
      console.error(`[consultaWorker] falha ao checar multas do veículo ${vehicle.id} (placa ${vehicle.placa}):`, err);
    }
  }
}

export function startConsultaWorker(): void {
  consultaQueue.process(JOB_NAME, checkFinesForPremiumVehicles);

  // 8h horário de SP, mesmo padrão do reminderWorker — jobId fixo pro Bull
  // deduplicar entre reinícios do processo.
  consultaQueue
    .add(JOB_NAME, {}, { repeat: { cron: '0 8 * * *', tz: 'America/Sao_Paulo' }, jobId: JOB_NAME })
    .catch((err) => console.error('[consultaWorker] falha ao agendar job repetível:', err.message));
}
