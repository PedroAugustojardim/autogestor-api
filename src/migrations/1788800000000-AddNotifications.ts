import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotifications1788800000000 implements MigrationInterface {
    name = 'AddNotifications1788800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`notifications\` (\`id\` int NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL, \`tipo\` varchar(50) NOT NULL, \`titulo\` varchar(150) NOT NULL, \`mensagem\` varchar(500) NOT NULL, \`lida\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_notifications_user_created\` (\`user_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`notifications\` ADD CONSTRAINT \`FK_notifications_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`notifications\` DROP FOREIGN KEY \`FK_notifications_user_id\``);
        await queryRunner.query(`DROP INDEX \`IDX_notifications_user_created\` ON \`notifications\``);
        await queryRunner.query(`DROP TABLE \`notifications\``);
    }

}
