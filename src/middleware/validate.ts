import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
// Registra as mensagens de validação em português (efeito colateral) — todo schema passa por aqui.
import '../schemas/errorMap';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: 'Dados inválidos',
          details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
        });
        return;
      }
      next(err);
    }
  };
}
