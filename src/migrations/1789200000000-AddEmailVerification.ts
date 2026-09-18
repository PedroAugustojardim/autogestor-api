import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailVerification1789200000000 implements MigrationInterface {
    name = 'AddEmailVerification1789200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`email_verified_at\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`email_verification_code\` varchar(64) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`email_verification_expires\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`email_verification_attempts\` int NOT NULL DEFAULT 0`);
        // Contas que já existem entram como verificadas na data em que foram criadas: até aqui
        // todo cadastro foi feito com convite entregue pessoalmente pelo fundador (piloto
        // fechado), então o email delas já foi "confirmado" fora do app. Sem isso, todo
        // mundo que já tem conta ficaria trancado pra fora no primeiro login depois do deploy.
        await queryRunner.query(`UPDATE \`users\` SET \`email_verified_at\` = \`created_at\``);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`email_verification_attempts\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`email_verification_expires\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`email_verification_code\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`email_verified_at\``);
    }

}
