import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { Expose } from "class-transformer";
import { Product } from "./Product";
import { ProductColor } from "./ProductColor";

@Entity("product_images")
@Index(["productId"])
export class ProductImage {
  @PrimaryGeneratedColumn()
  @Expose()
  id!: number;

  @Column({ name: "product_id", type: "int" })
  @Expose()
  productId!: number;

  @ManyToOne(() => Product, (p) => p.images, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ name: "color_id", type: "int", nullable: true })
  @Expose()
  colorId!: number | null;

  @ManyToOne(() => ProductColor, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "color_id" })
  color!: ProductColor | null;

  @Column({ name: "image_url", type: "text" })
  @Expose()
  imageUrl!: string;

  @Column({ name: "sort_order", type: "int", default: 0 })
  @Expose()
  sortOrder!: number;
}
