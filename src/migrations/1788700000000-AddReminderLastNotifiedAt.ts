import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReminderLastNotifiedAt1788700000000 implements MigrationInterface {
    name = 'AddReminderLastNotifiedAt1788700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`reminders\` ADD \`last_notified_at\` datetime NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`reminders\` DROP COLUMN \`last_notified_at\``);
    }

}
