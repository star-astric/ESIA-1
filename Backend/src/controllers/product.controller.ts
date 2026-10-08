import { Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { Product } from "../models/Product";
import { ProductColor } from "../models/ProductColor";
import { ProductSize } from "../models/ProductSize";
import { ProductImage } from "../models/ProductImage";
import { Category } from "../models/Category";
import { Color as PaletteColor } from "../models/Color";
import { OrderItem } from "../models/OrderItem";
import { CartItem } from "../models/CartItem";
import { ProductTag, DefaultShape, ProductSize as SizeEnum } from "../models/enums";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { deleteFile } from "../utils/fileUtils";

// ─── helpers: parse JSON-stringified arrays when coming via multipart/form-data ───
function tryParseJsonArray(val: any): any[] | null {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    // JSON array string: "[1,2]" or '[{"size":"M"}]'
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
        return [parsed];
      } catch {
        // fallback: try single-quoted JSON
        try {
          const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
          if (Array.isArray(parsed)) return parsed;
        } catch {}
      }
    }
    // comma-separated: "1,2,3" or "S,M,L"
    if (trimmed.includes(",")) return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    // single primitive
    return [trimmed];
  }
  return null;
}

// ─── file collection: images are FILES ONLY (no URLs, no isMain) ───
// gallery fieldnames: image[N], images[N], images, files, image, media
// cover fieldnames: cover, coverImage (single file, stored on products.cover_image_url)
const GALLERY_FIELD_RE = /^(?:image|images)(?:\[\d+\])?$/;
const LEGACY_GALLERY_FIELDS = new Set(["images", "files", "image", "media"]);

function collectUploadedFiles(req: Request): Express.Multer.File[] {
  const out: Express.Multer.File[] = [];
  if ((req as any).file) out.push((req as any).file as Express.Multer.File);
  const rf: any = (req as any).files;
  if (rf) {
    if (Array.isArray(rf)) out.push(...rf);
    else Object.values(rf).forEach((arr: any) => { if (Array.isArray(arr)) out.push(...(arr as Express.Multer.File[])); });
  }
  return out;
}

function splitCoverAndGallery(files: Express.Multer.File[]): { cover?: Express.Multer.File; gallery: Express.Multer.File[] } {
  const images = files.filter((f) => f.mimetype.startsWith("image/"));
  const cover = images.find((f) => f.fieldname === "cover" || f.fieldname === "coverImage");
  const gallery = images.filter((f) => f !== cover && (LEGACY_GALLERY_FIELDS.has(f.fieldname) || GALLERY_FIELD_RE.test(f.fieldname)));
  return { cover, gallery };
}

function fileUrl(file: Express.Multer.File): string {
  return `/uploads/products/images/${file.filename}`;
}

// Reject remote-URL image inputs — gallery and cover are files only now.
function rejectUrlImageInputs(body: any): void {
  const urlKeys = ["imageUrl", "image_url", "mainImageUrl", "main_image_url", "coverImageUrl", "cover_image_url"];
  for (const key of urlKeys) {
    const v = body[key];
    if (typeof v === "string" && v.trim()) {
      throw AppError.badRequest(`${key} is no longer supported. Upload an image file instead.`);
    }
  }
  // indexed url pattern: image[0].url / images[1].url
  for (const key of Object.keys(body)) {
    if (/^(?:image|images)\[\d+\]\.(url|imageurl)$/i.test(key) && String(body[key]).trim()) {
      throw AppError.badRequest("Image URLs are no longer supported. Upload image files instead.");
    }
    if (/^(?:image|images)\[\d+\]\.isMain$/i.test(key)) {
      throw AppError.badRequest("isMain is no longer supported. Use the product cover image instead.");
    }
  }
  if (body.isMain !== undefined || body.makeMain !== undefined || body.main !== undefined) {
    throw AppError.badRequest("isMain is no longer supported. Use the product cover image instead.");
  }
  if (Array.isArray(body.images) && body.images.length > 0) {
    throw AppError.badRequest("Pass gallery images as uploaded files (image[0], image[1], ...) instead of images array.");
  }
  if (typeof body.images === "string" && body.images.trim()) {
    throw AppError.badRequest("Pass gallery images as uploaded files (image[0], image[1], ...) instead of images array.");
  }
}

function parseColorsInput(raw: any): number[] {
  let colorsRaw: any = raw;
  const parsed = tryParseJsonArray(colorsRaw);
  if (parsed !== null) colorsRaw = parsed;
  if (!Array.isArray(colorsRaw) || colorsRaw.length === 0) {
    throw AppError.badRequest("colors is required and must be a non-empty array of existing Color IDs (e.g. [1,2])");
  }
  if (colorsRaw.length > 20) throw AppError.badRequest("colors must contain at most 20 items");
  const seen = new Set<number>();
  const ids = colorsRaw.map((c: any, idx: number) => {
    const n = Number(c);
    if (c === null || c === undefined || c === "" || Number.isNaN(n) || !Number.isInteger(n) || n <= 0) {
      throw AppError.badRequest(`colors[${idx}] must be a positive integer ID (existing colors.id)`);
    }
    if (seen.has(n)) throw AppError.badRequest(`colors[${idx}] ID ${n} is duplicate within product`);
    seen.add(n);
    return n;
  });
  return ids;
}

function parseSizesInput(raw: any): { size: string; isAvailable: boolean }[] {
  const parsedSizes = tryParseJsonArray(raw);
  const arr = parsedSizes !== null ? parsedSizes : raw;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw AppError.badRequest("sizes is required and must be a non-empty array of { size, isAvailable } or size strings (XS,S,M,L,XL,2X,3X)");
  }
  if (arr.length > 10) throw AppError.badRequest("sizes must contain at most 10 items");
  const validSizes = Object.values(SizeEnum);
  const seen = new Set<string>();
  return arr.map((s: any, idx: number) => {
    let sizeVal: string | undefined;
    let isAvailable: any = true;
    if (typeof s === "string") {
      sizeVal = s;
    } else if (s && typeof s === "object") {
      sizeVal = s.size ?? s.value;
      if (s.isAvailable !== undefined) isAvailable = s.isAvailable;
      if (s.is_available !== undefined) isAvailable = s.is_available;
    } else {
      throw AppError.badRequest(`sizes[${idx}] must be a string or object { size }`);
    }
    if (!sizeVal || typeof sizeVal !== "string") throw AppError.badRequest(`sizes[${idx}].size is required`);
    if (!validSizes.includes(sizeVal as SizeEnum)) {
      throw AppError.badRequest(`sizes[${idx}].size must be one of: ${validSizes.join(", ")}`);
    }
    if (seen.has(sizeVal)) throw AppError.badRequest(`sizes[${idx}].size "${sizeVal}" is duplicate within product`);
    seen.add(sizeVal);
    if (isAvailable !== undefined && typeof isAvailable !== "boolean") {
      if (isAvailable !== 0 && isAvailable !== 1 && isAvailable !== "true" && isAvailable !== "false") {
        throw AppError.badRequest(`sizes[${idx}].isAvailable must be a boolean`);
      }
    }
    return {
      size: sizeVal,
      isAvailable: Boolean(isAvailable === "true" ? true : isAvailable === "false" ? false : isAvailable),
    };
  });
}

function parseBoolean(val: any): boolean {
  return Boolean(val === "true" ? true : val === "false" ? false : val);
}

async function resolveCategoryId(body: any): Promise<number> {
  let categoryId: number | undefined;
  if (body.categoryId !== undefined && body.categoryId !== "") {
    const n = Number(body.categoryId);
    if (!Number.isInteger(n) || n <= 0) throw AppError.badRequest("categoryId must be a positive integer");
    categoryId = n;
  } else if (body.category_id !== undefined && body.category_id !== "") {
    const n = Number(body.category_id);
    if (!Number.isInteger(n) || n <= 0) throw AppError.badRequest("categoryId must be a positive integer");
    categoryId = n;
  } else if (body.categorySlug) {
    const cat = await AppDataSource.getRepository(Category).findOne({ where: { slug: String(body.categorySlug).trim().toLowerCase() } });
    if (!cat) throw AppError.notFound(`Category with slug "${body.categorySlug}" not found`);
    categoryId = cat.id;
  }
  if (!categoryId) throw AppError.badRequest("categoryId or categorySlug is required");
  const category = await AppDataSource.getRepository(Category).findOne({ where: { id: categoryId } });
  if (!category) throw AppError.notFound(`Category with id ${categoryId} not found`);
  return categoryId;
}

// Resolve palette IDs (global colors table or legacy product_colors rows) into rows to clone.
async function resolvePaletteColors(manager: any, colorIds: number[]) {
  const paletteRepo = manager.getRepository(PaletteColor);
  const colorRepo = manager.getRepository(ProductColor);
  const [globalColors, legacyColors] = await Promise.all([
    paletteRepo.find({ where: { id: In(colorIds) } }),
    colorRepo.find({ where: { id: In(colorIds) } }),
  ]);
  const combined = [...globalColors.map((c: any) => ({ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr, hexCode: c.hexCode })), ...legacyColors];
  const seen = new Map<number, any>();
  for (const pc of combined) if (!seen.has(pc.id)) seen.set(pc.id, pc);
  const paletteColors = [...seen.values()];
  if (paletteColors.length !== colorIds.length) {
    const foundIds = new Set(paletteColors.map((pc) => pc.id));
    const missing = colorIds.filter((id) => !foundIds.has(id));
    throw AppError.badRequest(`colors contains non-existent Color IDs: [${missing.join(", ")}] (check /colors palette)`);
  }
  const seenEn = new Set<string>();
  const seenAr = new Set<string>();
  const seenHex = new Set<string>();
  for (const pc of paletteColors) {
    const lowerEn = pc.nameEn.trim().toLowerCase();
    const keyAr = pc.nameAr.trim();
    const upperHex = pc.hexCode.trim().toUpperCase();
    if (seenEn.has(lowerEn)) throw AppError.badRequest(`Duplicate nameEn "${pc.nameEn}" among selected color IDs`);
    if (seenAr.has(keyAr)) throw AppError.badRequest(`Duplicate nameAr "${pc.nameAr}" among selected color IDs`);
    if (seenHex.has(upperHex)) throw AppError.badRequest(`Duplicate hexCode "${pc.hexCode}" among selected color IDs`);
    seenEn.add(lowerEn);
    seenAr.add(keyAr);
    seenHex.add(upperHex);
  }
  const paletteMap = new Map<number, any>(paletteColors.map((pc) => [pc.id, pc]));
  return colorIds.map((id) => paletteMap.get(id)!);
}

async function syncProductColors(manager: any, productId: number, paletteColors: any[]) {
  const colorRepo = manager.getRepository(ProductColor);
  const existing = await colorRepo.find({ where: { productId } });
  const retainedIds = new Set<number>();
  const synchronized: ProductColor[] = [];

  for (const source of paletteColors) {
    const match = existing.find((color: ProductColor) =>
      !retainedIds.has(color.id) && color.hexCode.toLowerCase() === String(source.hexCode).toLowerCase(),
    );
    if (match) {
      retainedIds.add(match.id);
      match.nameEn = source.nameEn;
      match.nameAr = source.nameAr;
      match.hexCode = source.hexCode;
      synchronized.push(await colorRepo.save(match));
    } else {
      synchronized.push(await colorRepo.save(colorRepo.create({
        productId,
        nameEn: source.nameEn,
        nameAr: source.nameAr,
        hexCode: source.hexCode,
      })));
    }
  }

  const removed = existing.filter((color: ProductColor) => !retainedIds.has(color.id));
  if (removed.length) await colorRepo.remove(removed);
  return synchronized;
}

function cleanupUploadedFiles(files: Express.Multer.File[]): void {
  for (const file of files) {
    try { deleteFile(`/uploads/products/images/${file.filename}`); } catch {}
    try { deleteFile((file as any).path); } catch {}
  }
}

async function loadFullProduct(id: number) {
  const product = await AppDataSource.getRepository(Product).findOne({
    where: { id },
    relations: { colors: true, sizes: true, images: true, category: true },
  });
  if (product?.images) product.images.sort((a, b) => a.sortOrder - b.sortOrder);
  return product;
}

function validateCreatePayload(body: any) {
  const errors: string[] = [];
  if (typeof body.name !== "string" || !body.name.trim()) errors.push("name is required");
  else if (body.name.trim().length < 2 || body.name.trim().length > 200) errors.push("name must be between 2 and 200 characters");
  if (body.price === undefined || body.price === null || body.price === "") errors.push("price is required");
  else {
    const p = Number(body.price);
    if (Number.isNaN(p) || p < 0) errors.push("price must be a valid non-negative number");
  }
  if (body.oldPrice !== undefined && body.oldPrice !== null && body.oldPrice !== "") {
    const op = Number(body.oldPrice);
    if (Number.isNaN(op) || op < 0) errors.push("oldPrice must be a valid non-negative number");
  }
  if (body.tag !== undefined && body.tag !== null && body.tag !== "") {
    if (!Object.values(ProductTag).includes(body.tag)) errors.push(`tag must be one of: ${Object.values(ProductTag).join(", ")}`);
  }
  if (body.defaultShape !== undefined && body.defaultShape !== null && body.defaultShape !== "") {
    if (!Object.values(DefaultShape).includes(body.defaultShape)) errors.push(`defaultShape must be one of: ${Object.values(DefaultShape).join(", ")}`);
  }
  if (body.shortDescription !== undefined && body.shortDescription !== null && body.shortDescription !== "") {
    if (typeof body.shortDescription !== "string") errors.push("shortDescription must be a string");
    else if (body.shortDescription.length > 5000) errors.push("shortDescription must be <= 5000 characters");
  }
  if (errors.length > 0) throw AppError.badRequest(errors);
}

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  rejectUrlImageInputs(req.body);
  validateCreatePayload(req.body);
  const colorIds = parseColorsInput(req.body.colors);
  const sizes = parseSizesInput(req.body.sizes);
  const categoryId = await resolveCategoryId(req.body);

  const uploadedFiles = collectUploadedFiles(req);
  const { cover, gallery } = splitCoverAndGallery(uploadedFiles);

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const productRepo = queryRunner.manager.getRepository(Product);
    const colorRepo = queryRunner.manager.getRepository(ProductColor);
    const sizeRepo = queryRunner.manager.getRepository(ProductSize);
    const imageRepo = queryRunner.manager.getRepository(ProductImage);

    const product = productRepo.create({
      categoryId,
      name: String(req.body.name).trim(),
      tag: req.body.tag || ProductTag.NONE,
      coverImageUrl: cover ? fileUrl(cover) : null,
      defaultShape: req.body.defaultShape || null,
      price: Number(req.body.price),
      oldPrice: req.body.oldPrice !== undefined && req.body.oldPrice !== null && req.body.oldPrice !== "" ? Number(req.body.oldPrice) : null,
      shortDescription: req.body.shortDescription || null,
      isActive: req.body.isActive !== undefined ? parseBoolean(req.body.isActive) : true,
    });
    const savedProduct = await productRepo.save(product);

    const paletteColors = await resolvePaletteColors(queryRunner.manager, colorIds);
    await colorRepo.save(paletteColors.map((src: any) => colorRepo.create({
      productId: savedProduct.id,
      nameEn: src.nameEn,
      nameAr: src.nameAr,
      hexCode: src.hexCode,
    })));

    await sizeRepo.save(sizes.map((s) => sizeRepo.create({ productId: savedProduct.id, size: s.size as SizeEnum, isAvailable: s.isAvailable })));

    if (gallery.length > 0) {
      await imageRepo.save(gallery.map((file, idx) => imageRepo.create({
        productId: savedProduct.id,
        imageUrl: fileUrl(file),
        sortOrder: idx,
      })));
    }

    await queryRunner.commitTransaction();
    const fullProduct = await loadFullProduct(savedProduct.id);
    res.status(201).json({ success: true, message: "Product created successfully", data: fullProduct, statusCode: 201 });
  } catch (err: any) {
    await queryRunner.rollbackTransaction();
    for (const f of uploadedFiles) {
      try { deleteFile(`/uploads/products/images/${f.filename}`); } catch {}
      try { deleteFile((f as any).path); } catch {}
    }
    if (err?.code === "23505") throw AppError.conflict("Duplicate product relation (color/size already exists for this product)");
    throw err;
  } finally {
    await queryRunner.release();
  }
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw AppError.badRequest("Invalid product id");
  rejectUrlImageInputs(req.body);

  const productRepo = AppDataSource.getRepository(Product);
  const product = await productRepo.findOne({ where: { id }, relations: { images: true } });
  if (!product) throw AppError.notFound("Product not found");

  const body = req.body;
  const errors: string[] = [];
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) errors.push("name must be a non-empty string");
    else if (body.name.trim().length < 2 || body.name.trim().length > 200) errors.push("name must be between 2 and 200 characters");
  }
  if (body.price !== undefined && body.price !== "") {
    const p = Number(body.price);
    if (Number.isNaN(p) || p < 0) errors.push("price must be a valid non-negative number");
  }
  if (body.oldPrice !== undefined && body.oldPrice !== null && body.oldPrice !== "") {
    const op = Number(body.oldPrice);
    if (Number.isNaN(op) || op < 0) errors.push("oldPrice must be a valid non-negative number");
  }
  if (body.tag !== undefined && body.tag !== null && body.tag !== "") {
    if (!Object.values(ProductTag).includes(body.tag)) errors.push(`tag must be one of: ${Object.values(ProductTag).join(", ")}`);
  }
  if (body.defaultShape !== undefined && body.defaultShape !== null && body.defaultShape !== "") {
    if (!Object.values(DefaultShape).includes(body.defaultShape)) errors.push(`defaultShape must be one of: ${Object.values(DefaultShape).join(", ")}`);
  }
  if (body.shortDescription !== undefined && body.shortDescription !== null && body.shortDescription !== "") {
    if (typeof body.shortDescription !== "string") errors.push("shortDescription must be a string");
    else if (body.shortDescription.length > 5000) errors.push("shortDescription must be <= 5000 characters");
  }
  if (errors.length > 0) throw AppError.badRequest(errors);

  let colorIds: number[] | null = null;
  if (body.colors !== undefined && body.colors !== null && body.colors !== "") {
    colorIds = parseColorsInput(body.colors);
  }
  let sizes: { size: string; isAvailable: boolean }[] | null = null;
  if (body.sizes !== undefined && body.sizes !== null && body.sizes !== "") {
    sizes = parseSizesInput(body.sizes);
  }
  let categoryId: number | undefined;
  if (body.categoryId !== undefined || body.category_id !== undefined || body.categorySlug !== undefined) {
    categoryId = await resolveCategoryId(body);
  }

  const uploadedFiles = collectUploadedFiles(req);
  const { cover, gallery } = splitCoverAndGallery(uploadedFiles);
  if (gallery.length > 0) {
    for (const f of [...(cover ? [cover] : []), ...gallery]) {
      try { deleteFile(`/uploads/products/images/${f.filename}`); } catch {}
      try { deleteFile((f as any).path); } catch {}
    }
    throw AppError.badRequest("Pass gallery images to POST /:id/images. This endpoint accepts only a cover file plus product fields.");
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const txProductRepo = queryRunner.manager.getRepository(Product);
    const txSizeRepo = queryRunner.manager.getRepository(ProductSize);

    const entity = await txProductRepo.findOne({ where: { id } });
    if (!entity) throw AppError.notFound("Product not found");

    if (body.name !== undefined) entity.name = String(body.name).trim();
    if (categoryId !== undefined) entity.categoryId = categoryId;
    if (body.price !== undefined && body.price !== "") entity.price = Number(body.price);
    if (body.oldPrice !== undefined) {
      entity.oldPrice = body.oldPrice === null || body.oldPrice === "" ? null : Number(body.oldPrice);
    }
    if (body.tag !== undefined && body.tag !== "") entity.tag = body.tag;
    if (body.defaultShape !== undefined) entity.defaultShape = body.defaultShape === "" ? null : body.defaultShape;
    if (body.shortDescription !== undefined) entity.shortDescription = body.shortDescription === "" ? null : body.shortDescription;
    if (body.isActive !== undefined) entity.isActive = parseBoolean(body.isActive);

    if (cover) {
      deleteFile(entity.coverImageUrl);
      entity.coverImageUrl = fileUrl(cover);
    }
    await txProductRepo.save(entity);

    if (colorIds) {
      // resolve BEFORE deleting: ids may reference this product's own color rows
      const paletteColors = await resolvePaletteColors(queryRunner.manager, colorIds);
      await syncProductColors(queryRunner.manager, id, paletteColors);
    }
    if (sizes) {
      await txSizeRepo.delete({ productId: id });
      await txSizeRepo.save(sizes.map((s) => txSizeRepo.create({ productId: id, size: s.size as SizeEnum, isAvailable: s.isAvailable })));
    }

    await queryRunner.commitTransaction();
    const fullProduct = await loadFullProduct(id);
    res.status(200).json({ success: true, message: "Product updated successfully", data: fullProduct, statusCode: 200 });
  } catch (err: any) {
    await queryRunner.rollbackTransaction();
    if (cover) {
      try { deleteFile(`/uploads/products/images/${cover.filename}`); } catch {}
      try { deleteFile((cover as any).path); } catch {}
    }
    if (err?.code === "23505") throw AppError.conflict("Duplicate product relation (color/size already exists for this product)");
    throw err;
  } finally {
    await queryRunner.release();
  }
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw AppError.badRequest("Invalid product id");

  const productRepo = AppDataSource.getRepository(Product);
  const product = await productRepo.findOne({ where: { id }, relations: { images: true } });
  if (!product) throw AppError.notFound("Product not found");

  const [orderRefs, cartRefs] = await Promise.all([
    AppDataSource.getRepository(OrderItem).count({ where: { productId: id } }),
    AppDataSource.getRepository(CartItem).count({ where: { productId: id } }),
  ]);
  if (orderRefs > 0 || cartRefs > 0) {
    throw AppError.conflict("لا يمكن حذف هذا المنتج لأنه مرتبط بطلبات أو سلال تسوق. يمكنك إيقافه بدلاً من ذلك.");
  }

  deleteFile(product.coverImageUrl);
  for (const img of product.images) deleteFile(img.imageUrl);
  await productRepo.remove(product);

  res.status(200).json({ success: true, message: "Product deleted successfully", data: null, statusCode: 200 });
});

export const uploadProductCover = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw AppError.badRequest("Invalid product id");
  rejectUrlImageInputs(req.body);

  const productRepo = AppDataSource.getRepository(Product);
  const product = await productRepo.findOne({ where: { id } });
  if (!product) {
    for (const f of collectUploadedFiles(req)) {
      try { deleteFile(`/uploads/products/images/${f.filename}`); } catch {}
      try { deleteFile((f as any).path); } catch {}
    }
    throw AppError.notFound("Product not found");
  }

  const { cover, gallery } = splitCoverAndGallery(collectUploadedFiles(req));
  const file = cover ?? gallery[0];
  if (!file) throw AppError.badRequest("No cover image file provided (fieldname: cover)");

  deleteFile(product.coverImageUrl);
  product.coverImageUrl = fileUrl(file);
  await productRepo.save(product);

  const fullProduct = await loadFullProduct(id);
  res.status(200).json({ success: true, message: "Cover image updated successfully", data: fullProduct, statusCode: 200 });
});

export const removeProductCover = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw AppError.badRequest("Invalid product id");

  const productRepo = AppDataSource.getRepository(Product);
  const product = await productRepo.findOne({ where: { id } });
  if (!product) throw AppError.notFound("Product not found");

  deleteFile(product.coverImageUrl);
  product.coverImageUrl = null;
  await productRepo.save(product);

  const fullProduct = await loadFullProduct(id);
  res.status(200).json({ success: true, message: "Cover image removed successfully", data: fullProduct, statusCode: 200 });
});

export const getAllProducts = asyncHandler(async (req: Request, res: Response) => {
  const repo = AppDataSource.getRepository(Product);
  const categoryRepo = AppDataSource.getRepository(Category);

  // ─── Filter by category — supports ?categoryId=1 or ?categorySlug=dresses or ?category=1|dresses|slug ───
  const q: any = req.query;
  let where: any = {};
  let categoryFilterActive = false;
  let categoryNotFound = false;

  const rawCategoryId = q.categoryId ?? q.category_id ?? q.category;
  const rawSlug = q.categorySlug ?? q.category_slug ?? q.slug;

  if (rawCategoryId !== undefined && rawCategoryId !== null && rawCategoryId !== "") {
    // if rawCategoryId is numeric string, treat as id; otherwise as slug
    const n = Number(rawCategoryId);
    if (Number.isInteger(n) && String(n) === String(rawCategoryId).trim()) {
      where.categoryId = n;
      categoryFilterActive = true;
    } else {
      // non-numeric -> treat value as slug (covers ?category=dresses)
      const slug = String(rawCategoryId).trim().toLowerCase();
      const cat = await categoryRepo.findOne({ where: { slug } });
      if (!cat) categoryNotFound = true;
      else {
        where.categoryId = cat.id;
        categoryFilterActive = true;
      }
    }
  } else if (rawSlug !== undefined && rawSlug !== null && rawSlug !== "") {
    const slug = String(rawSlug).trim().toLowerCase();
    const cat = await categoryRepo.findOne({ where: { slug } });
    if (!cat) categoryNotFound = true;
    else {
      where.categoryId = cat.id;
      categoryFilterActive = true;
    }
  }

  if (categoryNotFound) {
    res.status(200).json({ success: true, message: "Operation completed successfully", data: [], statusCode: 200 });
    return;
  }

  const products = await repo.find({
    where: categoryFilterActive ? where : {},
    relations: { colors: true, sizes: true, images: true, category: true },
    order: { id: "ASC" } as any,
  });
  // List view: cover image + basics for card (outside show) — details endpoint returns full gallery
  const listData = products.map((p) => {
    if (p.images) p.images.sort((a, b) => a.sortOrder - b.sortOrder);
    const cover = p.coverImageUrl || p.images?.[0]?.imageUrl || null;
    return {
      id: p.id,
      name: p.name,
      categoryId: p.categoryId,
      category: p.category ? { id: (p.category as any).id, name: (p.category as any).name, slug: (p.category as any).slug } : null,
      price: p.price,
      oldPrice: p.oldPrice,
      tag: p.tag,
      isActive: p.isActive,
      coverImageUrl: cover,
      images: (p.images ?? []).map((img) => ({ id: img.id, imageUrl: img.imageUrl, sortOrder: img.sortOrder, colorId: img.colorId })),
      colors: p.colors,
      createdAt: (p as any).createdAt,
    };
  });
  res.status(200).json({ success: true, message: "Operation completed successfully", data: listData, statusCode: 200 });
});

export const getProductById = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw AppError.badRequest("Invalid product id");
  const product = await loadFullProduct(id);
  if (!product) throw AppError.notFound("Product not found");
  // expose effective cover (own cover, else first gallery image) without persisting the fallback
  const sharedGalleryCover = product.images?.find((image) => image.colorId == null)?.imageUrl;
  const data = { ...product, coverImageUrl: product.coverImageUrl || sharedGalleryCover || null };
  res.status(200).json({ success: true, message: "Operation completed successfully", data, statusCode: 200 });
});

// ─── gallery management (files only, ordered by sort_order) ───
// Add images to existing product
export const addProductImages = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw AppError.badRequest("Invalid product id");
  rejectUrlImageInputs(req.body);

  const { gallery } = splitCoverAndGallery(collectUploadedFiles(req));
  if (gallery.length === 0) throw AppError.badRequest("No image files provided (fieldnames: image[0], image[1], ... or images)");

  let colorId: number | null = null;
  if (req.body.colorId !== undefined && req.body.colorId !== null && req.body.colorId !== "") {
    colorId = Number(req.body.colorId);
    if (!Number.isInteger(colorId) || colorId <= 0) {
      cleanupUploadedFiles(gallery);
      throw AppError.badRequest("colorId must be a positive integer belonging to this product");
    }
  }

  const productRepo = AppDataSource.getRepository(Product);
  const imageRepo = AppDataSource.getRepository(ProductImage);

  const product = await productRepo.findOne({ where: { id }, relations: { images: true } });
  if (!product) {
    cleanupUploadedFiles(gallery);
    throw AppError.notFound("Product not found");
  }

  if (colorId !== null) {
    const productColor = await AppDataSource.getRepository(ProductColor).findOne({ where: { id: colorId, productId: id } });
    if (!productColor) {
      cleanupUploadedFiles(gallery);
      throw AppError.badRequest("colorId must belong to this product");
    }
  }

  const nextOrder = product.images.length > 0 ? Math.max(...product.images.map((i) => i.sortOrder)) + 1 : 0;
  await imageRepo.save(gallery.map((file, idx) => imageRepo.create({
    productId: id,
    colorId,
    imageUrl: fileUrl(file),
    sortOrder: nextOrder + idx,
  })));

  const updated = await loadFullProduct(id);
  res.status(200).json({ success: true, message: "Images added successfully", data: updated, statusCode: 200 });
});

// Assign an existing gallery image to a product color, or clear the assignment.
export const setProductImageColor = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const imageId = Number(req.params.imageId);
  if (!Number.isInteger(id) || !Number.isInteger(imageId)) throw AppError.badRequest("Invalid product or image id");

  const imageRepo = AppDataSource.getRepository(ProductImage);
  const image = await imageRepo.findOne({ where: { id: imageId, productId: id } });
  if (!image) throw AppError.notFound("Image not found for this product");

  let colorId: number | null = null;
  if (req.body.colorId !== undefined && req.body.colorId !== null && req.body.colorId !== "") {
    colorId = Number(req.body.colorId);
    if (!Number.isInteger(colorId) || colorId <= 0) throw AppError.badRequest("colorId must be a positive integer belonging to this product");
    const productColor = await AppDataSource.getRepository(ProductColor).findOne({ where: { id: colorId, productId: id } });
    if (!productColor) throw AppError.badRequest("colorId must belong to this product");
  }

  image.colorId = colorId;
  await imageRepo.save(image);
  const updated = await loadFullProduct(id);
  res.status(200).json({ success: true, message: "Image color updated successfully", data: updated, statusCode: 200 });
});

// Remove image by its sort_order (or id)
export const removeProductImage = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw AppError.badRequest("Invalid product id");
  // allow order via params or body: DELETE /:id/images/:order or body { order, imageId }
  const rawOrder = (req.params as any).order ?? (req.params as any).imageId ?? req.body.order ?? req.body.sortOrder ?? req.body.imageId;
  if (rawOrder === undefined || rawOrder === null) throw AppError.badRequest("order or imageId is required");
  const parsedOrder = Number(rawOrder);
  if (Number.isNaN(parsedOrder)) throw AppError.badRequest("order must be a number");

  const productRepo = AppDataSource.getRepository(Product);
  const imageRepo = AppDataSource.getRepository(ProductImage);

  const product = await productRepo.findOne({ where: { id }, relations: { images: true } });
  if (!product) throw AppError.notFound("Product not found");

  // try find by sortOrder first, then by id
  let target = product.images.find((img) => img.sortOrder === parsedOrder);
  if (!target) target = product.images.find((img) => img.id === parsedOrder);
  if (!target) throw AppError.notFound(`No image found with order/id ${parsedOrder}`);

  deleteFile(target.imageUrl);
  await imageRepo.remove(target);

  // re-normalize remaining orders to 0,1,2...
  const remaining = (await imageRepo.find({ where: { productId: id }, order: { sortOrder: "ASC" } }));
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].sortOrder !== i) {
      remaining[i].sortOrder = i;
      await imageRepo.save(remaining[i]);
    }
  }

  const updated = await loadFullProduct(id);
  res.status(200).json({ success: true, message: "Image removed successfully", data: updated, statusCode: 200 });
});

// Reorder images — body { currentOrder, newOrder }
export const reorderProductImages = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw AppError.badRequest("Invalid product id");
  const { currentOrder, newOrder } = req.body;
  if (currentOrder === undefined || newOrder === undefined) throw AppError.badRequest("currentOrder and newOrder are required");
  const parsedCurrent = Number(currentOrder);
  const parsedNew = Number(newOrder);
  if (Number.isNaN(parsedCurrent) || Number.isNaN(parsedNew)) throw AppError.badRequest("currentOrder and newOrder must be numbers");

  const imageRepo = AppDataSource.getRepository(ProductImage);

  const product = await AppDataSource.getRepository(Product).findOne({ where: { id }, relations: { images: true } });
  if (!product) throw AppError.notFound("Product not found");

  const item = product.images.find((img) => img.sortOrder === parsedCurrent);
  if (!item) throw AppError.notFound(`No image found with order ${parsedCurrent}`);
  if (parsedNew === parsedCurrent) {
    if (product.images) product.images.sort((a, b) => a.sortOrder - b.sortOrder);
    res.status(200).json({ success: true, message: "Operation completed successfully", data: product, statusCode: 200 });
    return;
  }

  if (parsedNew > parsedCurrent) {
    for (const img of product.images) {
      if (img.sortOrder > parsedCurrent && img.sortOrder <= parsedNew) {
        img.sortOrder -= 1;
        await imageRepo.save(img);
      }
    }
  } else {
    for (const img of product.images) {
      if (img.sortOrder >= parsedNew && img.sortOrder < parsedCurrent) {
        img.sortOrder += 1;
        await imageRepo.save(img);
      }
    }
  }
  item.sortOrder = parsedNew;
  await imageRepo.save(item);

  const updated = await loadFullProduct(id);
  res.status(200).json({ success: true, message: "Images reordered successfully", data: updated, statusCode: 200 });
});
