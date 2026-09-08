import { IConsultaProvider } from './IConsultaProvider';
import { MockProvider } from './MockProvider';

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
      console.warn(`[consulta] CONSULTA_PROVIDER="${provider}" ainda não tem implementação — usando MockProvider`);
      return new MockProvider();
  }
}
