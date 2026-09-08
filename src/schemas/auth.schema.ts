import { z } from 'zod';

// Único lugar que define o formato de email — os 4 schemas que pedem email (aqui e
// em user.schema.ts) importam este em vez de repetir a cadeia, pra não divergir
// (já tinha acontecido: só register/updateMe tinham o .max(150), que é o limite
// real da coluna no banco — login e forgot-password aceitavam qualquer tamanho).
export const emailSchema = z.string().trim().toLowerCase().email('Email inválido').max(150);

export const passwordSchema = z
  .string()
  .min(8, 'A senha deve ter no mínimo 8 caracteres')
  .max(72, 'A senha deve ter no máximo 72 caracteres')
  .regex(/[A-Z]/, 'A senha deve ter ao menos uma letra maiúscula')
  .regex(/[0-9]/, 'A senha deve ter ao menos um número')
  .regex(/[^A-Za-z0-9]/, 'A senha deve ter ao menos um símbolo');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter no mínimo 2 caracteres').max(100),
  email: emailSchema,
  password: passwordSchema,
  inviteCode: z.string().trim().min(1, 'Código de convite é obrigatório'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Senha é obrigatória'),
});

// refreshToken é opcional no body porque o admin (browser) manda o valor via
// cookie httpOnly em vez do body — AuthController.refresh checa os dois lugares
// e responde 400 se nenhum dos dois trouxer o token.
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'token é obrigatório'),
  password: passwordSchema,
});
