import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductImageColors1760000000003 implements MigrationInterface {
  name = "ProductImageColors1760000000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn("product_images", "color_id"))) {
      await queryRunner.query(`ALTER TABLE "product_images" ADD COLUMN "color_id" integer`);
      await queryRunner.query(`
        ALTER TABLE "product_images"
        ADD CONSTRAINT "FK_product_images_color"
        FOREIGN KEY ("color_id") REFERENCES "product_colors"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
      `);
    }
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_images_color_id" ON "product_images" ("color_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_images_color_id"`);
    if (await queryRunner.hasColumn("product_images", "color_id")) {
      await queryRunner.query(`ALTER TABLE "product_images" DROP CONSTRAINT IF EXISTS "FK_product_images_color"`);
      await queryRunner.query(`ALTER TABLE "product_images" DROP COLUMN "color_id"`);
    }
  }
}
