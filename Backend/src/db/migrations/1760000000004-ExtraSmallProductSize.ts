import { MigrationInterface, QueryRunner } from "typeorm";

export class ExtraSmallProductSize1760000000004 implements MigrationInterface {
  name = "ExtraSmallProductSize1760000000004";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "product_size" ADD VALUE IF NOT EXISTS 'XS' BEFORE 'S'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot remove enum values directly. Convert XS to S before rebuilding the type.
    await queryRunner.query(`ALTER TYPE "product_size" RENAME TO "product_size_with_xs"`);
    await queryRunner.query(`CREATE TYPE "product_size" AS ENUM ('S', 'M', 'L', 'XL', '2X', '3X')`);

    for (const table of ["product_sizes", "order_items", "cart_items"]) {
      await queryRunner.query(`
        UPDATE "${table}"
        SET "size" = 'S'::"product_size_with_xs"
        WHERE "size"::text = 'XS'
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ALTER COLUMN "size" TYPE "product_size"
        USING "size"::text::"product_size"
      `);
    }

    await queryRunner.query(`DROP TYPE "product_size_with_xs"`);
  }
}
