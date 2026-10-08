import { useEffect, useMemo, useState } from "react";
import { mapBackendProduct, type CatalogProduct } from "../data/catalog";
import { getApiErrorMessage } from "../lib/api";
import { colorsService, type Color } from "../services/colors";
import { productsService } from "../services/products";
import { ProductCard, SiteChrome } from "./SiteChrome";

interface Props {
  productId: string;
  onNavigate: (view: string, productId?: string) => void;
  cart: number;
  onAddToCart: (item: {
    productId: string;
    name: string;
    price: number;
    size: string;
    color: string;
    colorNameEn: string;
    colorNameAr: string;
    colorHex: string;
    colorId?: number;
    image: string;
    qty: number;
  }) => Promise<void>;
  showGuestSignIn?: boolean;
}

export default function ProductDetail({
  productId,
  onNavigate,
  cart,
  onAddToCart,
  showGuestSignIn,
}: Props) {
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [related, setRelated] = useState<CatalogProduct[]>([]);
  const [colors, setColors] = useState<Color[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedColor, setSelectedColor] = useState(0);
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [cartMessage, setCartMessage] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    Promise.all([
      productsService.byId(productId),
      productsService.list(),
      colorsService.list().catch(() => []),
    ])
      .then(([rawProduct, rawRelated, globalColors]) => {
        if (!current) return;
        const mapped = mapBackendProduct(rawProduct);
        if (!mapped) throw new Error("The server returned an invalid product.");
        setProduct(mapped);
        setRelated(rawRelated.map(mapBackendProduct).filter((item): item is CatalogProduct => item !== null && item.id !== mapped.id && item.isActive).slice(0, 4));
        setColors(globalColors);
        setSelectedSize(mapped.sizes.find((size) => !mapped.unavailableSizes.includes(size)) ?? "");
        setActiveImage(0);
        setSelectedColor(0);
        setQuantity(1);
        setCartMessage(null);
      })
      .catch((loadError) => {
        if (current) {
          setProduct(null);
          setRelated([]);
          setError(getApiErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [productId, retryKey]);

  const color = product?.colors[selectedColor] ?? product?.colors[0];
  // Show the selected color's images when it has its own gallery, otherwise show shared images.
  const images = useMemo(() => {
    if (!product) return [];
    const colorId = product.colors[selectedColor]?.backendId;
    const colorImages = colorId === undefined
      ? []
      : product.images.filter((item) => item.colorId === colorId);
    if (colorImages.length) return colorImages.map((item) => item.imageUrl);

    const sharedImages = product.images.filter((item) => item.colorId == null).map((item) => item.imageUrl).filter(Boolean);
    const cover = product.coverImageUrl || sharedImages[0] || "";
    return cover ? [cover, ...sharedImages.filter((src) => src !== cover)] : sharedImages;
  }, [product, selectedColor]);
  const image = images[activeImage] ?? "";
  const tagLabel = product?.tag === "new" ? "جديد" : product?.tag === "best_seller" ? "الأكثر مبيعاً" : null;
  const availableSizes = product ? product.sizes.filter((size) => !product.unavailableSizes.includes(size)) : [];
  const globalColor = colors.find((item) =>
    (color?.hexCode && item.hexCode.toLowerCase() === color.hexCode.toLowerCase()) ||
    item.nameEn.toLowerCase() === color?.nameEn.toLowerCase(),
  );

  const addToCart = async () => {
    if (!product || (availableSizes.length > 0 && !selectedSize)) return;
    setSubmitting(true);
    setCartMessage(null);
    try {
      await onAddToCart({
        productId: product.id,
        name: product.name,
        price: product.price,
        size: selectedSize,
        color: color?.nameAr ?? color?.nameEn ?? "",
        colorNameEn: color?.nameEn ?? "",
        colorNameAr: color?.nameAr ?? "",
        colorHex: color?.hexCode ?? "",
        colorId: globalColor?.id,
        image,
        qty: quantity,
      });
      setCartMessage("تمت إضافة المنتج إلى السلة.");
    } catch (addError) {
      setCartMessage(getApiErrorMessage(addError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteChrome view="product" onNavigate={onNavigate} cart={cart} showGuestSignIn={showGuestSignIn}>
      <div className="mx-auto max-w-[1260px] px-5 py-8">
        <button type="button" onClick={() => onNavigate("home")} className="mb-6 bg-transparent p-0 text-sm" style={{ color: "var(--rose-deep)" }}>الرئيسية / المنتجات</button>
        {loading && <p className="py-24 text-center" role="status">جارٍ تحميل المنتج...</p>}
        {!loading && error && <div role="alert" className="rounded-2xl bg-white p-8 text-center text-red-700">{error}<div><button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-4 underline">إعادة المحاولة</button></div></div>}
        {!loading && !error && !product && <p className="py-24 text-center">المنتج غير متاح.</p>}

        {!loading && !error && product && (
          <>
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <div className="relative overflow-hidden rounded-3xl bg-[#f5e9e8]" style={{ border: "1px solid var(--line)", aspectRatio: "4/5" }}>
                  {image ? <img src={image} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center">{product.name}</div>}
                  {tagLabel && <span className="absolute end-3 top-3 rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: "var(--rose-deep)" }}>{tagLabel}</span>}
                  {!product.isActive && <span className="absolute bottom-3 start-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">غير متاح حالياً</span>}
                </div>
                {images.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto">{images.map((src, index) => <button key={index + "-" + src} type="button" onClick={() => setActiveImage(index)} className="h-20 w-16 shrink-0 overflow-hidden rounded-xl border-2" style={{ borderColor: activeImage === index ? "var(--rose-deep)" : "var(--line)" }}><img src={src} alt="" className="h-full w-full object-cover" /></button>)}</div>}
                {product.colors.length > 0 && <div className="mt-4">
                  <p className="mb-3 text-sm font-semibold">اللون: {color?.nameAr || color?.nameEn}</p>
                  <div className="flex gap-3">{product.colors.map((item, index) => <button key={item.backendId ?? index} type="button" aria-label={item.nameAr} aria-pressed={selectedColor === index} onClick={() => { setSelectedColor(index); setActiveImage(0); }} className="h-8 w-8 rounded-full border-2" style={{ background: item.hexCode ?? item.color, borderColor: selectedColor === index ? "var(--plum)" : "var(--line)" }} />)}</div>
                </div>}
              </div>
              <div className="rounded-3xl bg-white p-6 md:p-8" style={{ border: "1px solid var(--line)" }}>
                {product.categoryName && <p className="text-xs" style={{ color: "var(--gold)" }}>{product.categoryName}</p>}
                <h1 className="mt-2 font-marcellus text-3xl" style={{ color: "var(--plum)" }}>{product.name}</h1>
                {product.sub && <p className="mt-3 leading-7" style={{ color: "var(--plum-soft)" }}>{product.sub}</p>}
                <div className="mt-5 flex items-center gap-3">
                  <span className="text-2xl font-bold" style={{ color: "var(--rose-deep)" }}>{product.price.toLocaleString()} ج.م</span>
                  {product.originalPrice !== null && <span className="line-through" style={{ color: "var(--gray)" }}>{product.originalPrice.toLocaleString()} ج.م</span>}
                </div>

                <div className="mt-7">
                  <p className="mb-3 text-sm font-semibold">المقاس</p>
                  <div className="flex flex-wrap gap-2">{product.sizes.map((size) => {
                    const available = !product.unavailableSizes.includes(size);
                    return <button key={size} type="button" disabled={!available} onClick={() => setSelectedSize(size)} className="min-w-12 rounded-xl border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: selectedSize === size ? "var(--rose-deep)" : "var(--line)", background: selectedSize === size ? "var(--blush-soft)" : "#fff" }}>{size}</button>;
                  })}</div>
                  {!availableSizes.length && <p className="mt-2 text-sm text-red-700">لا توجد مقاسات متاحة حالياً.</p>}
                </div>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <div className="flex items-center rounded-xl border" style={{ borderColor: "var(--line)" }}>
                    <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="px-4 py-2">−</button>
                    <span className="min-w-8 text-center">{quantity}</span>
                    <button type="button" disabled={quantity >= 99} onClick={() => setQuantity((value) => Math.min(99, value + 1))} className="px-4 py-2">+</button>
                  </div>
                  <button type="button" onClick={addToCart} disabled={(availableSizes.length > 0 && !selectedSize) || submitting || !product.isActive} className="flex-1 rounded-xl px-6 py-3 font-bold text-white disabled:opacity-50" style={{ background: "var(--rose-deep)" }}>{submitting ? "جارٍ الإضافة..." : "أضيفي إلى السلة"}</button>
                </div>
                {cartMessage && <p role="status" className="mt-4 text-sm" style={{ color: "var(--plum-soft)" }}>{cartMessage}</p>}
                {product.fabric && <div className="mt-8 border-t pt-5" style={{ borderColor: "var(--line)" }}><h2 className="font-semibold">التفاصيل</h2><p className="mt-2 leading-7" style={{ color: "var(--plum-soft)" }}>{product.fabric}</p></div>}
              </div>
            </div>
            <section className="mt-14">
              <h2 className="mb-5 font-marcellus text-2xl" style={{ color: "var(--plum)" }}>منتجات أخرى</h2>
              {related.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">{related.map((item) => <ProductCard key={item.id} item={item} onOpen={(id) => onNavigate("product", id)} />)}</div> : <p style={{ color: "var(--plum-soft)" }}>لا توجد منتجات أخرى حالياً.</p>}
            </section>
          </>
        )}
      </div>
    </SiteChrome>
  );
}
