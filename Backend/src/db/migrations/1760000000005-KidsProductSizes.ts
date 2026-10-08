import { MigrationInterface, QueryRunner } from "typeorm";

export class KidsProductSizes1760000000005 implements MigrationInterface {
  name = "KidsProductSizes1760000000005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const size of ["6-7", "7-8", "8-9", "9-10", "10-11", "11-12"]) {
      await queryRunner.query(
        `ALTER TYPE "product_size" ADD VALUE IF NOT EXISTS '${size}'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot remove enum values directly. Map kids sizes to M before rebuilding the type.
    await queryRunner.query(`ALTER TYPE "product_size" RENAME TO "product_size_with_kids"`);
    await queryRunner.query(
      `CREATE TYPE "product_size" AS ENUM ('XS', 'S', 'M', 'L', 'XL', '2X', '3X')`,
    );

    for (const table of ["product_sizes", "order_items", "cart_items"]) {
      await queryRunner.query(`
        UPDATE "${table}"
        SET "size" = 'M'::"product_size_with_kids"
        WHERE "size"::text IN ('6-7', '7-8', '8-9', '9-10', '10-11', '11-12')
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ALTER COLUMN "size" TYPE "product_size"
        USING "size"::text::"product_size"
      `);
    }

    await queryRunner.query(`DROP TYPE "product_size_with_kids"`);
  }
}
