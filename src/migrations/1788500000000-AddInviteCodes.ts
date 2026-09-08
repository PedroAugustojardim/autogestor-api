import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInviteCodes1788500000000 implements MigrationInterface {
    name = 'AddInviteCodes1788500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`invite_codes\` (\`id\` int NOT NULL AUTO_INCREMENT, \`code\` varchar(64) NOT NULL, \`used_by\` int NULL, \`expires_at\` datetime NULL, \`used_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_invite_codes_code\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`invite_codes\` ADD CONSTRAINT \`FK_invite_codes_used_by\` FOREIGN KEY (\`used_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`invite_codes\` DROP FOREIGN KEY \`FK_invite_codes_used_by\``);
        await queryRunner.query(`DROP TABLE \`invite_codes\``);
    }

}
