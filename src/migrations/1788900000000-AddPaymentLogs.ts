import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentLogs1788900000000 implements MigrationInterface {
    name = 'AddPaymentLogs1788900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`payment_logs\` (\`id\` int NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL, \`plano\` enum ('premium_mensal', 'premium_anual') NOT NULL, \`valor\` decimal(10,2) NOT NULL, \`mercado_pago_preference_id\` varchar(100) NULL, \`mercado_pago_payment_id\` varchar(100) NULL, \`status\` enum ('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_payment_logs_mp_payment_id\` (\`mercado_pago_payment_id\`), INDEX \`IDX_payment_logs_user_status\` (\`user_id\`, \`status\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`payment_logs\` ADD CONSTRAINT \`FK_payment_logs_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`payment_logs\` DROP FOREIGN KEY \`FK_payment_logs_user_id\``);
        await queryRunner.query(`DROP INDEX \`IDX_payment_logs_user_status\` ON \`payment_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_payment_logs_mp_payment_id\` ON \`payment_logs\``);
        await queryRunner.query(`DROP TABLE \`payment_logs\``);
    }

}
