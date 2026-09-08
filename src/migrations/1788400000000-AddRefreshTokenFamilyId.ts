import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRefreshTokenFamilyId1788400000000 implements MigrationInterface {
    name = 'AddRefreshTokenFamilyId1788400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` ADD \`family_id\` varchar(36) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` DROP COLUMN \`family_id\``);
    }

}
