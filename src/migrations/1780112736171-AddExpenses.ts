import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExpenses1780112736171 implements MigrationInterface {
    name = 'AddExpenses1780112736171'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`expense_categories\` (\`id\` int NOT NULL AUTO_INCREMENT, \`nome\` varchar(100) NOT NULL, \`icone\` varchar(10) NULL, \`tipo_veiculo\` enum ('todos', 'carro', 'moto', 'caminhao', 'van') NOT NULL DEFAULT 'todos', \`ativo\` tinyint NOT NULL DEFAULT 1, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`expenses\` (\`id\` int NOT NULL AUTO_INCREMENT, \`vehicle_id\` int NOT NULL, \`category_id\` int NOT NULL, \`valor\` decimal(10,2) NOT NULL, \`data\` date NOT NULL, \`descricao\` varchar(255) NULL, \`km_atual\` int NULL, \`litros\` decimal(6,3) NULL, \`preco_litro\` decimal(6,3) NULL, \`tipo_combustivel\` varchar(30) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`expenses\` ADD CONSTRAINT \`FK_5fc8d9c2e4f6105eb9ccbae8f38\` FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`expenses\` ADD CONSTRAINT \`FK_5d1f4be708e0dfe2afa1a3c376c\` FOREIGN KEY (\`category_id\`) REFERENCES \`expense_categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`expenses\` DROP FOREIGN KEY \`FK_5d1f4be708e0dfe2afa1a3c376c\``);
        await queryRunner.query(`ALTER TABLE \`expenses\` DROP FOREIGN KEY \`FK_5fc8d9c2e4f6105eb9ccbae8f38\``);
        await queryRunner.query(`DROP TABLE \`expenses\``);
        await queryRunner.query(`DROP TABLE \`expense_categories\``);
    }

}
