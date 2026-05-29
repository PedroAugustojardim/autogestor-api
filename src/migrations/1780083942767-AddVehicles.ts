import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVehicles1780083942767 implements MigrationInterface {
    name = 'AddVehicles1780083942767'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`vehicles\` (\`id\` int NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL, \`tipo\` enum ('carro', 'moto', 'caminhao', 'van') NOT NULL, \`marca\` varchar(100) NOT NULL, \`modelo\` varchar(100) NOT NULL, \`ano\` int NULL, \`placa\` varchar(10) NULL, \`renavam\` varchar(11) NULL, \`cor\` varchar(50) NULL, \`apelido\` varchar(50) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`vehicles\` ADD CONSTRAINT \`FK_88b36924d769e4df751bcfbf249\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`vehicles\` DROP FOREIGN KEY \`FK_88b36924d769e4df751bcfbf249\``);
        await queryRunner.query(`DROP TABLE \`vehicles\``);
    }

}
