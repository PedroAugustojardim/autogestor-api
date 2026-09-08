import { Request } from 'express';

// Marca que o app mobile manda em todo request (ver autogestor-mobile/src/services/api.ts).
// Só quem manda esse UA explícito é tratado como cliente confiável pra receber o
// refresh token no corpo da resposta — todo o resto (o admin, curl, qualquer coisa
// nova) cai no padrão seguro: token só no cookie httpOnly.
const MOBILE_USER_AGENT_MARKER = /AutoGestorMobile/i;

// Decide se o request pode receber o refresh token no corpo da resposta.
//
// Antes disso confiava num header (`X-Auth-Transport: cookie`) que o PRÓPRIO
// CLIENT decidia mandar ou não — um XSS rodando na origem do admin podia simular
// ser "mobile" só não mandando esse header, e ler o refresh token direto do JSON
// mesmo com o cookie httpOnly protegido (a proteção do cookie não vale nada se o
// mesmo valor também vem no body). User-Agent resolve isso de um jeito que um
// script de página não consegue forjar: é "forbidden header name" na spec do
// Fetch — `fetch()`/`XMLHttpRequest` de dentro de uma página NUNCA conseguem
// sobrescrever o valor real que o navegador manda, então o que chega aqui é
// sempre genuíno pra qualquer coisa rodando dentro de um browser (inclusive um
// script malicioso). O app mobile, por não ser uma página de browser, pode setar
// livremente o próprio header — e faz isso de propósito, com um marcador só dele.
//
// Fail-secure por padrão: qualquer coisa que não mande o marcador (o admin, uma
// ferramenta nova, um curl de teste) é tratada como "não confiável" e não recebe
// o token no body — o oposto do design anterior, que confiava em tudo que não
// dissesse "sou o admin".
export function isTrustedMobileClient(req: Request): boolean {
  const userAgent = req.headers['user-agent'] ?? '';
  return MOBILE_USER_AGENT_MARKER.test(userAgent);
}
