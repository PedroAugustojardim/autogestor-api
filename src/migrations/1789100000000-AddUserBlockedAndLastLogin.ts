import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserBlockedAndLastLogin1789100000000 implements MigrationInterface {
    name = 'AddUserBlockedAndLastLogin1789100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`blocked\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`last_login_at\` datetime NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`last_login_at\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`blocked\``);
    }

}
