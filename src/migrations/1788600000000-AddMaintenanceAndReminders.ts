import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMaintenanceAndReminders1788600000000 implements MigrationInterface {
    name = 'AddMaintenanceAndReminders1788600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`maintenances\` (\`id\` int NOT NULL AUTO_INCREMENT, \`vehicle_id\` int NOT NULL, \`tipo\` varchar(100) NOT NULL, \`data\` date NOT NULL, \`km\` int NULL, \`custo\` decimal(10,2) NULL, \`descricao\` varchar(255) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`maintenances\` ADD CONSTRAINT \`FK_maintenances_vehicle_id\` FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);

        await queryRunner.query(`CREATE TABLE \`reminders\` (\`id\` int NOT NULL AUTO_INCREMENT, \`vehicle_id\` int NOT NULL, \`maintenance_id\` int NULL, \`tipo\` varchar(100) NOT NULL, \`data_prevista\` date NOT NULL, \`silenciado\` tinyint NOT NULL DEFAULT 0, \`concluido\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`reminders\` ADD CONSTRAINT \`FK_reminders_vehicle_id\` FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`reminders\` ADD CONSTRAINT \`FK_reminders_maintenance_id\` FOREIGN KEY (\`maintenance_id\`) REFERENCES \`maintenances\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`reminders\` DROP FOREIGN KEY \`FK_reminders_maintenance_id\``);
        await queryRunner.query(`ALTER TABLE \`reminders\` DROP FOREIGN KEY \`FK_reminders_vehicle_id\``);
        await queryRunner.query(`DROP TABLE \`reminders\``);
        await queryRunner.query(`ALTER TABLE \`maintenances\` DROP FOREIGN KEY \`FK_maintenances_vehicle_id\``);
        await queryRunner.query(`DROP TABLE \`maintenances\``);
    }

}
