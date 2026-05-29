import Bull from 'bull';
import * as dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const reminderQueue = new Bull('reminders', redisUrl);
export const emailQueue = new Bull('emails', redisUrl);
export const consultaQueue = new Bull('consultas', redisUrl);
export const notificationQueue = new Bull('notifications', redisUrl);
