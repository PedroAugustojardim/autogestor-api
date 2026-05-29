import 'reflect-metadata';
import app from './app';
import { AppDataSource } from './config/database';

const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ Variáveis de ambiente obrigatórias não definidas: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

AppDataSource.initialize()
  .then(() => {
    console.log('✅ Banco de dados conectado');
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar no banco:', err);
    process.exit(1);
  });
