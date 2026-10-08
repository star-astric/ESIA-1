import { MigrationInterface, QueryRunner } from "typeorm";

export class ExtendedProductSizes1760000000002 implements MigrationInterface {
  name = "ExtendedProductSizes1760000000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "product_size" ADD VALUE IF NOT EXISTS '2X'`);
    await queryRunner.query(`ALTER TYPE "product_size" ADD VALUE IF NOT EXISTS '3X'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot remove enum values directly. Map extended sizes to XL
    // before rebuilding the enum with its original values.
    await queryRunner.query(`ALTER TYPE "product_size" RENAME TO "product_size_extended"`);
    await queryRunner.query(`CREATE TYPE "product_size" AS ENUM ('S', 'M', 'L', 'XL')`);

    for (const table of ["product_sizes", "order_items", "cart_items"]) {
      await queryRunner.query(`
        UPDATE "${table}"
        SET "size" = 'XL'::"product_size_extended"
        WHERE "size"::text IN ('2X', '3X')
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ALTER COLUMN "size" TYPE "product_size"
        USING "size"::text::"product_size"
      `);
    }

    await queryRunner.query(`DROP TYPE "product_size_extended"`);
  }
}
