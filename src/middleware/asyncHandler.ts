import { Request, Response, NextFunction, RequestHandler } from 'express';

// Express 4 não captura rejeição de promise em handler async — sem isso, um erro
// (banco fora do ar, constraint violada etc.) vira unhandled rejection e pode
// derrubar o processo inteiro em vez de virar um 500 para aquela requisição.
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req, res, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
