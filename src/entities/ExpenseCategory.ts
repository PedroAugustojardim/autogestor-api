import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

export type CategoryVehicleType = 'todos' | 'carro' | 'moto' | 'caminhao' | 'van';

@Entity('expense_categories')
export class ExpenseCategory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 100 })
  nome!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  icone!: string | null;

  @Column({
    name: 'tipo_veiculo',
    type: 'enum',
    enum: ['todos', 'carro', 'moto', 'caminhao', 'van'],
    default: 'todos',
  })
  tipoVeiculo!: CategoryVehicleType;

  @Column({ default: true })
  ativo!: boolean;
}
