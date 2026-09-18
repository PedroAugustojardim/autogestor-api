import { IConsultaProvider } from './IConsultaProvider';
import { MockProvider } from './MockProvider';
import { logger } from '../../utils/logger';

export * from './IConsultaProvider';

// CONSULTA_PROVIDER decide qual API real usar quando existir (Integrador SP.GOV.BR
// / SERPRO / Infosimples — decisão de negócio ainda pendente, ver Novo guia.docx
// seção 24). Até lá, ou se o valor não for reconhecido, cai no MockProvider.
export function getConsultaProvider(): IConsultaProvider {
  const provider = process.env.CONSULTA_PROVIDER || 'mock';

  switch (provider) {
    case 'mock':
      return new MockProvider();
    default:
      logger.warn({ provider }, '[consulta] CONSULTA_PROVIDER sem implementação — usando MockProvider');
      return new MockProvider();
  }
}
