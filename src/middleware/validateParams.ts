import { Router } from 'express';

// Parâmetros de rota que carregam um id numérico do banco (INT).
const ID_PARAMS = ['id', 'eid', 'mid', 'rid'];
const MAX_INT = 2_147_483_647;

// Chamar uma vez por router. Sem isto, `Number('abc')` virava NaN e o driver do MySQL
// respondia com erro de SQL → 500 (e um evento no Sentry) pra qualquer id que não fosse
// número: /vehicles/abc, /notifications/NaN, /admin/users/Infinity... Um id que não é um
// inteiro positivo dentro do INT do banco simplesmente não existe: 404.
//
// `router.param` roda antes de qualquer handler da rota (inclusive o authMiddleware), então
// um id inválido dá 404 mesmo sem token — não revela nada que o 401 já não revelaria.
export function validateIdParams(router: Router): void {
  for (const name of ID_PARAMS) {
    router.param(name, (_req, res, next, value: string) => {
      if (/^\d{1,10}$/.test(value) && Number(value) <= MAX_INT) {
        next();
        return;
      }
      res.status(404).json({ error: 'Recurso não encontrado' });
    });
  }
}
