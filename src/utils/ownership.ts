import { AppDataSource } from '../config/database';
import { Vehicle } from '../entities/Vehicle';

const vRepo = () => AppDataSource.getRepository(Vehicle);

// Padrão de IDOR-guard usado por todo controller que opera em recurso vinculado a
// um veículo (gastos, manutenção, lembretes, relatórios): nunca fazer findOneBy({id})
// sem filtrar por dono.
export async function ownsVehicle(vehicleId: number, userId: number): Promise<Vehicle | null> {
  return vRepo().findOneBy({ id: vehicleId, userId });
}
