import { Request } from 'express';
import { isTrustedMobileClient } from '../utils/clientDetection';

// Regressão do gap de segurança encontrado em 2026-09-04: a decisão de incluir o
// refresh token no corpo da resposta usava um header (X-Auth-Transport) que o
// PRÓPRIO CLIENT escolhia mandar — um XSS rodando na origem do admin podia só
// omitir esse header pra ser tratado como "mobile" e ler o token direto do JSON,
// mesmo com o cookie httpOnly configurado. A troca pra User-Agent fecha isso
// porque nenhum script de página consegue sobrescrever esse header (é "forbidden
// header name" na spec do Fetch) — só um app nativo (fora do sandbox de página)
// pode setar livremente, como o mobile faz de propósito com um marcador só dele.

function fakeReq(userAgent: string | undefined): Request {
  return { headers: userAgent === undefined ? {} : { 'user-agent': userAgent } } as unknown as Request;
}

describe('isTrustedMobileClient', () => {
  it('reconhece o marcador do app mobile', () => {
    expect(isTrustedMobileClient(fakeReq('AutoGestorMobile/1.0'))).toBe(true);
  });

  it('reconhece o marcador mesmo com outras infos do dispositivo no UA', () => {
    expect(isTrustedMobileClient(fakeReq('AutoGestorMobile/1.0 (Android 14; okhttp/4.9.3)'))).toBe(true);
  });

  it('rejeita um navegador real (Chrome) — precisa ficar restrito ao cookie httpOnly', () => {
    expect(isTrustedMobileClient(fakeReq(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    ))).toBe(false);
  });

  it('rejeita um script tentando se passar por mobile via header customizado — só o User-Agent conta', () => {
    // Simula exatamente o vetor de ataque original: um script rodando dentro do
    // admin não consegue reescrever `user-agent` (o browser ignora essa tentativa
    // silenciosamente), então mesmo tentando imitar o app mobile via outro
    // cabeçalho, o valor que chega ao servidor continua sendo o do browser real.
    expect(isTrustedMobileClient(fakeReq('Mozilla/5.0 (fingindo ser mobile)'))).toBe(false);
  });

  it('nega por padrão quando não há User-Agent nenhum (fail-secure)', () => {
    expect(isTrustedMobileClient(fakeReq(undefined))).toBe(false);
  });

  it('nega para um cliente desconhecido (curl, ferramenta de teste)', () => {
    expect(isTrustedMobileClient(fakeReq('curl/8.4.0'))).toBe(false);
  });
});
