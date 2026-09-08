import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVehicleFineTracking1789000000000 implements MigrationInterface {
    name = 'AddVehicleFineTracking1789000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`vehicles\` ADD \`last_fine_check_at\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`vehicles\` ADD \`last_known_fine_count\` int NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`vehicles\` DROP COLUMN \`last_known_fine_count\``);
        await queryRunner.query(`ALTER TABLE \`vehicles\` DROP COLUMN \`last_fine_check_at\``);
    }

}
