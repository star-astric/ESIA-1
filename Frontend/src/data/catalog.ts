export type CategoryKey = string;

export interface CatalogColor {
  color: string;
  nameEn: string;
  nameAr: string;
  hexCode?: string;
  backendId?: number;
  img?: string;
  thumbs?: string[];
}

export interface CatalogImage {
  id: number;
  imageUrl: string;
  sortOrder: number;
  colorId?: number | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sub: string;
  price: number;
  originalPrice: number | null;
  tag: string | null;
  category: CategoryKey;
  categoryId?: number;
  categoryName?: string;
  isActive: boolean;
  colors: CatalogColor[];
  sizes: string[];
  unavailableSizes: string[];
  img: string;
  coverImageUrl?: string;
  thumbs: string[];
  images: CatalogImage[];
  fabric: string;
  care: string;
}

export function mapBackendProduct(product: any): CatalogProduct | null {
  if (!product || typeof product !== "object" || product.id === undefined) return null;

  const rawImages = Array.isArray(product.images) ? product.images : [];
  const images: CatalogImage[] = rawImages
    .map((image: any, index: number) => ({
      id: Number(image?.id ?? index),
      imageUrl: String(typeof image === "string" ? image : image?.imageUrl ?? image?.url ?? ""),
      sortOrder: Number(image?.sortOrder ?? index),
      colorId: image?.colorId === undefined || image?.colorId === null || image?.colorId === ""
        ? null
        : Number(image.colorId),
    }))
    .filter((image: CatalogImage) => Boolean(image.imageUrl))
    .sort((a: CatalogImage, b: CatalogImage) => a.sortOrder - b.sortOrder);

  // Cover (outside/card image) lives on the product itself; fall back to first gallery image.
  const coverImage =
    product.coverImageUrl ??
    product.mainImageUrl ??
    product.mainImage?.imageUrl ??
    "";
  const mainImage =
    coverImage ||
    images.find((image) => image.colorId == null)?.imageUrl ||
    images[0]?.imageUrl ||
    "";
  const category = product.category ?? {};
  const categorySlug = String(
    category?.slug ?? product.categorySlug ?? product.category ?? "",
  );

  const colors: CatalogColor[] = Array.isArray(product.colors)
    ? product.colors.map((color: any, index: number) => {
        const nameEn = String(color?.nameEn ?? color?.name ?? "Color " + (index + 1));
        const nameAr = String(color?.nameAr ?? nameEn);
        return {
          color: color?.hexCode ?? color?.hex_code ?? nameEn,
          nameEn,
          nameAr,
          hexCode: color?.hexCode ?? color?.hex_code,
          backendId: Number.isFinite(Number(color?.id)) ? Number(color.id) : undefined,
          img: mainImage,
          thumbs: images.map((image) => image.imageUrl),
        };
      })
    : [];

  const rawSizes = Array.isArray(product.sizes) ? product.sizes : [];
  const sizes = rawSizes
    .map((size: any) => String(typeof size === "string" ? size : size?.size ?? size?.value ?? ""))
    .filter(Boolean);
  const unavailableSizes = rawSizes
    .filter((size: any) => typeof size === "object" && size?.isAvailable === false)
    .map((size: any) => String(size.size ?? size.value));

  return {
    id: String(product.id),
    name: String(product.name ?? "Product"),
    sub: String(product.shortDescription ?? product.description ?? ""),
    price: Number(product.price ?? 0),
    originalPrice:
      product.oldPrice !== undefined && product.oldPrice !== null
        ? Number(product.oldPrice)
        : null,
    tag: product.tag ? String(product.tag) : null,
    category: categorySlug,
    categoryId: Number(product.categoryId ?? category?.id) || undefined,
    categoryName: category?.name ? String(category.name) : undefined,
    isActive: product.isActive !== false,
    colors: colors.length
      ? colors
      : [{ color: "#8f747e", nameEn: "Default", nameAr: "Default", img: mainImage }],
    sizes,
    unavailableSizes,
    img: String(mainImage),
    coverImageUrl: String(coverImage),
    thumbs: images.map((image) => image.imageUrl),
    images,
    fabric: String(product.shortDescription ?? product.description ?? ""),
    care: "",
  };
}
