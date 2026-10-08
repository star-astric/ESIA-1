import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../lib/api";
import { useCategories } from "../lib/categoryContext";
import { productsService } from "../services/products";
import { colorsService } from "../services/colors";

type PaletteColor = { id: number; nameEn: string; nameAr: string; hexCode: string };
type ProductImage = { id: number; imageUrl: string; sortOrder: number; colorId?: number | null };
type ProductRow = {
  id: number;
  name: string;
  price: number;
  oldPrice?: number | null;
  tag?: string | null;
  defaultShape?: string | null;
  shortDescription?: string | null;
  isActive?: boolean;
  categoryId?: number;
  coverImageUrl?: string | null;
  category?: { id?: number; name?: string; slug?: string } | null;
  colors?: PaletteColor[];
  sizes?: Array<{ id?: number; size: string; isAvailable?: boolean }>;
  images?: ProductImage[];
};

const SIZES = ["XS", "S", "M", "L", "XL", "2X", "3X"];
const inputClass = "mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:border-[#9a4f63]";
const btnClass = "rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50";

const emptyForm = {
  name: "",
  categoryId: "",
  price: "",
  oldPrice: "",
  shortDescription: "",
  tag: "none",
  shape: "",
  isActive: true,
};

export default function AdminProducts({ onNavigate, onLogout }: { onNavigate: (view: string) => void; onLogout: () => void }) {
  const { categories } = useCategories();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selected, setSelected] = useState<ProductRow | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLElement | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [selectedColorIds, setSelectedColorIds] = useState<number[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["S", "M", "L"]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [galleryColorId, setGalleryColorId] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [globalPalette, setGlobalPalette] = useState<PaletteColor[]>([]);

  const setField = (key: keyof typeof emptyForm, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const palette = useMemo(() => {
    // Primary source: global /colors palette (works even with zero products).
    // Fallback: colors found on existing products (legacy/clone flow).
    const source = globalPalette.length ? globalPalette : products.flatMap((product) => product.colors ?? []);
    const unique = new Map<string, PaletteColor>();
    for (const color of source) {
      if (!color || !color.hexCode || !color.nameEn) continue;
      const key = String(color.hexCode).toLowerCase() + "|" + String(color.nameEn).toLowerCase();
      if (!unique.has(key)) unique.set(key, color);
    }
    return [...unique.values()];
  }, [products, globalPalette]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, paletteColors] = await Promise.all([
        productsService.list(),
        colorsService.list().catch(() => [] as PaletteColor[]),
      ]);
      setGlobalPalette(Array.isArray(paletteColors) ? paletteColors : []);
      const rows = Array.isArray(data) ? data as ProductRow[] : [];
      setProducts(rows);
      if (editingId !== null) {
        const current = rows.find((item) => item.id === editingId);
        if (current) setSelected(await productsService.byId(current.id) as ProductRow);
      }
    } catch (loadError) {
      setProducts([]);
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [editingId]);

  useEffect(() => { void loadProducts(); }, [loadProducts]);

  const resetForm = () => {
    setForm(emptyForm);
    setSelectedColorIds([]);
    setSelectedSizes(["S", "M", "L"]);
    setImageFiles([]);
    setCoverFile(null);
    setNewImageFiles([]);
    setGalleryColorId("");
  };

  const startNew = () => {
    resetForm();
    setSelected(null);
    setEditingId(null);
    setError(null);
    setNotice(null);
  };

  const fillFormFromProduct = (product: ProductRow) => {
    setForm({
      name: product.name ?? "",
      categoryId: String(product.categoryId ?? product.category?.id ?? ""),
      price: String(product.price ?? ""),
      oldPrice: product.oldPrice !== null && product.oldPrice !== undefined ? String(product.oldPrice) : "",
      shortDescription: product.shortDescription ?? "",
      tag: product.tag ?? "none",
      shape: product.defaultShape ?? "",
      isActive: product.isActive !== false,
    });
    setSelectedColorIds((product.colors ?? []).map((productColor) => {
      const matchingPaletteColor = palette.find((color) =>
        color.hexCode.toLowerCase() === productColor.hexCode.toLowerCase() ||
        color.nameEn.toLowerCase() === productColor.nameEn.toLowerCase(),
      );
      return matchingPaletteColor?.id ?? productColor.id;
    }).filter((id) => Number.isFinite(id)));
    const sizes = (product.sizes ?? []).filter((s) => s.isAvailable !== false).map((s) => s.size);
    setSelectedSizes(sizes.length ? sizes : []);
    setImageFiles([]);
    setCoverFile(null);
    setNewImageFiles([]);
    setGalleryColorId("");
  };

  const selectProduct = async (id: number) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const full = await productsService.byId(id) as ProductRow;
      setSelected(full);
      setEditingId(full.id);
      fillFormFromProduct(full);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setBusy(false);
    }
  };

  const makeGalleryForm = (files: File[]) => {
    const formData = new FormData();
    files.forEach((file, index) => {
      formData.append("image[" + index + "]", file);
    });
    return formData;
  };

  const submitProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedColorIds.length) {
      setError("اختر لوناً واحداً على الأقل من لوحة الألوان.");
      return;
    }
    if (!selectedSizes.length) {
      setError("اختر مقاساً واحداً على الأقل.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("name", form.name.trim());
      formData.append("categoryId", form.categoryId);
      formData.append("price", form.price);
      if (form.oldPrice) formData.append("oldPrice", form.oldPrice);
      formData.append("shortDescription", form.shortDescription.trim());
      formData.append("tag", form.tag);
      if (form.shape) formData.append("defaultShape", form.shape);
      formData.append("isActive", form.isActive ? "true" : "false");
      formData.append("colors", JSON.stringify(selectedColorIds));
      formData.append("sizes", JSON.stringify(selectedSizes.map((size) => ({ size, isAvailable: true }))));

      if (editingId !== null) {
        const updated = await productsService.update(editingId, formData);
        setSelected(updated as ProductRow);
        fillFormFromProduct(updated as ProductRow);
        setNotice("تم حفظ التعديلات.");
      } else {
        imageFiles.forEach((file, index) => {
          formData.append("image[" + index + "]", file);
        });
        if (coverFile) formData.append("cover", coverFile);
        await productsService.create(formData);
        startNew();
        setNotice("تم إنشاء المنتج.");
      }
      await loadProducts();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const deleteProduct = async () => {
    if (editingId === null || !window.confirm("حذف هذا المنتج نهائياً؟ لا يمكن التراجع.")) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await productsService.remove(editingId);
      startNew();
      setNotice("تم حذف المنتج.");
      await loadProducts();
    } catch (removeError) {
      setError(getApiErrorMessage(removeError));
    } finally {
      setBusy(false);
    }
  };

  const uploadCover = async () => {
    if (editingId === null || !coverFile) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await productsService.uploadCover(editingId, coverFile);
      setSelected(updated as ProductRow);
      setCoverFile(null);
      setNotice("تم تحديث صورة الغلاف.");
      await loadProducts();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const deleteCover = async () => {
    if (editingId === null || !window.confirm("إزالة صورة الغلاف؟")) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await productsService.removeCover(editingId);
      setSelected(updated as ProductRow);
      setNotice("تمت إزالة صورة الغلاف.");
      await loadProducts();
    } catch (removeError) {
      setError(getApiErrorMessage(removeError));
    } finally {
      setBusy(false);
    }
  };

  const addImages = async () => {
    if (!selected || !newImageFiles.length) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const formData = makeGalleryForm(newImageFiles);
      if (galleryColorId) formData.append("colorId", galleryColorId);
      const updated = await productsService.addImages(selected.id, formData);
      setSelected(updated as ProductRow);
      setNewImageFiles([]);
      setNotice("تمت إضافة الصور.");
      await loadProducts();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const setImageColor = async (image: ProductImage, colorId: number | null) => {
    if (!selected || image.colorId === colorId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await productsService.setImageColor(selected.id, image.id, colorId);
      setSelected(updated as ProductRow);
      setNotice("تم تحديث لون الصورة.");
      await loadProducts();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async (image: ProductImage) => {
    if (!selected || !window.confirm("حذف هذه الصورة؟")) return;
    setBusy(true);
    setError(null);
    try {
      setSelected(await productsService.removeImage(selected.id, image.sortOrder) as ProductRow);
      setNotice("تم حذف الصورة.");
      await loadProducts();
    } catch (removeError) {
      setError(getApiErrorMessage(removeError));
    } finally {
      setBusy(false);
    }
  };

  const moveImage = async (image: ProductImage, direction: -1 | 1) => {
    if (!selected) return;
    const next = image.sortOrder + direction;
    if (next < 0 || next >= (selected.images?.length ?? 0)) return;
    setBusy(true);
    setError(null);
    try {
      setSelected(await productsService.reorderImages(selected.id, image.sortOrder, next) as ProductRow);
      setNotice("تم تغيير ترتيب الصور.");
      await loadProducts();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const toggleSize = (size: string) => setSelectedSizes((values) => values.includes(size) ? values.filter((value) => value !== size) : [...values, size]);
  const toggleColor = (id: number) => setSelectedColorIds((values) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);

  const coverPreview = (selected?.coverImageUrl ?? selected?.images?.[0]?.imageUrl) || null;
  const isEditing = editingId !== null;

  return (
    <main className="min-h-screen" style={{ background: "var(--ivory)" }}>
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-4" style={{ borderColor: "var(--line)" }}>
        <div><strong className="font-marcellus text-xl" style={{ color: "var(--rose-deep)" }}>ESIA</strong><span className="ms-3 text-sm">إدارة المنتجات</span></div>
        <nav className="flex flex-wrap gap-2">
          <button className={btnClass + " border"} onClick={() => onNavigate("admin-orders")}>الطلبات</button>
          <button className={btnClass + " text-white"} style={{ background: "var(--rose-deep)" }}>المنتجات</button>
          <button className={btnClass + " border"} onClick={() => onNavigate("admin-catalog")}>الفئات والألوان</button>
          <button className={btnClass + " border"} onClick={onLogout}>تسجيل الخروج</button>
        </nav>
      </header>
      <div className="mx-auto max-w-[1260px] space-y-6 px-5 py-8">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<button type="button" onClick={() => void loadProducts()} className="ms-3 underline">إعادة التحميل</button></p>}
        {notice && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
        {loading ? <p role="status" className="py-12 text-center">جارٍ تحميل المنتجات...</p> : (
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <section className="h-fit rounded-2xl bg-white p-5" style={{ border: "1px solid var(--line)" }}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h1 className="text-xl font-bold">المنتجات الحالية</h1>
                <button type="button" onClick={startNew} className={btnClass + " border"} disabled={busy}>+ منتج جديد</button>
              </div>
              {error ? null : products.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">لا توجد منتجات بعد.</p> : (
                <div className="space-y-2">{products.map((product) => {
                  const thumb = product.coverImageUrl ?? product.images?.[0]?.imageUrl;
                  return (
                    <button key={product.id} type="button" onClick={() => void selectProduct(product.id)} className="flex w-full items-center gap-3 rounded-xl border p-3 text-right" style={{ borderColor: editingId === product.id ? "var(--rose-deep)" : "var(--line)" }}>
                      {thumb ? <img src={thumb} alt="" className="h-14 w-12 rounded-lg object-cover" /> : <span className="h-14 w-12 rounded-lg bg-[#f5e9e8]" />}
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{product.name}</span><span className="text-xs text-gray-500">{product.category?.name ?? product.category?.slug} · {Number(product.price).toLocaleString()} ج.م{product.isActive === false ? " · موقوف" : ""}</span></span>
                    </button>
                  );
                })}</div>
              )}
            </section>

            <div className="space-y-6">
              <section ref={formRef} className="scroll-mt-24 rounded-2xl bg-white p-5" style={{ border: "1px solid var(--line)" }}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-bold">{isEditing ? "تعديل المنتج" + (selected ? ": " + selected.name : "") : "إضافة منتج"}</h2>
                  {isEditing && (
                    <div className="flex gap-2">
                      <button type="button" onClick={startNew} className={btnClass + " border"} disabled={busy}>إلغاء التعديل</button>
                      <button type="button" onClick={() => void deleteProduct()} className={btnClass + " border text-red-700"} disabled={busy}>حذف المنتج</button>
                    </div>
                  )}
                </div>
                <form onSubmit={submitProduct} className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">اسم المنتج<input required minLength={2} value={form.name} onChange={(event) => setField("name", event.target.value)} className={inputClass} /></label>
                  <label className="text-sm">الفئة<select required value={form.categoryId} onChange={(event) => setField("categoryId", event.target.value)} className={inputClass}><option value="">اختر الفئة</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                  <label className="text-sm">السعر<input required type="number" min="0" step="0.01" value={form.price} onChange={(event) => setField("price", event.target.value)} className={inputClass} /></label>
                  <label className="text-sm">السعر السابق (اختياري)<input type="number" min="0" step="0.01" value={form.oldPrice} onChange={(event) => setField("oldPrice", event.target.value)} className={inputClass} /></label>
                  <label className="text-sm">الشارة<select value={form.tag} onChange={(event) => setField("tag", event.target.value)} className={inputClass}><option value="none">بدون</option><option value="new">جديد</option><option value="best_seller">الأكثر مبيعاً</option></select></label>
                  <label className="text-sm">الشكل<select value={form.shape} onChange={(event) => setField("shape", event.target.value)} className={inputClass}><option value="">بدون</option><option value="puff_sleeves">أكمام منفوشة</option><option value="layers">طبقات</option><option value="bow">فيونكة</option><option value="long">طويل</option><option value="abaya">عباية</option><option value="circular">دائري</option></select></label>
                  <label className="text-sm md:col-span-2">وصف قصير<textarea value={form.shortDescription} onChange={(event) => setField("shortDescription", event.target.value)} className={inputClass} rows={3} /></label>
                  <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={form.isActive} onChange={(event) => setField("isActive", event.target.checked)} />منتج نشط (يظهر في المتجر)</label>
                  <fieldset className="md:col-span-2"><legend className="mb-2 text-sm font-semibold">الألوان</legend>{palette.length ? <div className="flex flex-wrap gap-2">{palette.map((color) => <label key={color.id} className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: "var(--line)" }}><input type="checkbox" checked={selectedColorIds.includes(color.id)} onChange={() => toggleColor(color.id)} /><span className="h-4 w-4 rounded-full border" style={{ background: color.hexCode }} />{color.nameAr}</label>)}</div> : <p className="text-sm text-amber-700">لا توجد ألوان متاحة. أضف ألواناً من صفحة الفئات والألوان.</p>}</fieldset>
                  <fieldset className="md:col-span-2"><legend className="mb-2 text-sm font-semibold">المقاسات</legend><div className="flex gap-4">{SIZES.map((size) => <label key={size} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={selectedSizes.includes(size)} onChange={() => toggleSize(size)} />{size}</label>)}</div></fieldset>
                  {!isEditing && (
                    <>
                      <label className="text-sm">صورة الغلاف (الخارجية)<input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} className={inputClass} /><span className="mt-1 block text-xs text-gray-500">صورة واحدة تظهر في البطاقات. إن لم تختر، تُستخدم أول صورة من المعرض.</span></label>
                      <label className="text-sm">صور المعرض<input type="file" accept="image/*" multiple onChange={(event) => setImageFiles(Array.from(event.target.files ?? []))} className={inputClass} /><span className="mt-1 block text-xs text-gray-500">بعد حفظ المنتج، يمكنك اختيار لون لإضافة صور خاصة به.</span></label>
                    </>
                  )}
                  <button disabled={busy || !categories.length || !palette.length} className={btnClass + " md:col-span-2 text-white"} style={{ background: "var(--rose-deep)" }}>{busy ? "جارٍ الحفظ..." : isEditing ? "حفظ التعديلات" : "إنشاء المنتج"}</button>
                </form>
              </section>

              {selected && isEditing && (
                <>
                  <section className="rounded-2xl bg-white p-5" style={{ border: "1px solid var(--line)" }}>
                    <h2 className="mb-1 text-xl font-bold">صورة الغلاف</h2>
                    <p className="mb-4 text-sm text-gray-600">الصورة الخارجية التي تظهر في بطاقات المتجر.</p>
                    <div className="flex flex-wrap items-center gap-4">
                      {coverPreview ? <img src={coverPreview} alt="الغلاف" className="h-36 w-28 rounded-xl border object-cover" style={{ borderColor: "var(--line)" }} /> : <span className="flex h-36 w-28 items-center justify-center rounded-xl bg-[#f5e9e8] text-xs text-gray-500">لا يوجد غلاف</span>}
                      <div className="min-w-[220px] flex-1 space-y-2">
                        <input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} className="w-full rounded-xl border p-2 text-sm" />
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={busy || !coverFile} onClick={() => void uploadCover()} className={btnClass + " text-white"} style={{ background: "var(--rose-deep)" }}>رفع الغلاف</button>
                          {selected.coverImageUrl && <button type="button" disabled={busy} onClick={() => void deleteCover()} className={btnClass + " border text-red-700"}>إزالة الغلاف</button>}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl bg-white p-5" style={{ border: "1px solid var(--line)" }}>
                    <h2 className="text-xl font-bold">صور المعرض: {selected.name}</h2>
                    <p className="mb-4 mt-1 text-sm text-gray-600">ارفع عدة صور للون نفسه، أو اتركها صورًا مشتركة لكل الألوان. يمكنك أيضًا تغيير لون الصور الموجودة.</p>
                    <div className="mb-4 flex flex-wrap gap-2">
                      <label className="w-full text-sm">لون الصور الجديدة
                        <select value={galleryColorId} onChange={(event) => setGalleryColorId(event.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm" disabled={busy}>
                          <option value="">صور مشتركة لكل الألوان</option>
                          {(selected.colors ?? []).map((color) => <option key={color.id} value={color.id}>{color.nameAr || color.nameEn}</option>)}
                        </select>
                      </label>
                      <input type="file" accept="image/*" multiple onChange={(event) => setNewImageFiles(Array.from(event.target.files ?? []))} className="min-w-0 flex-1 rounded-xl border p-2 text-sm" />
                      <button type="button" disabled={busy || !newImageFiles.length} onClick={() => void addImages()} className={btnClass + " text-white"} style={{ background: "var(--rose-deep)" }}>رفع الصور</button>
                    </div>
                    {!selected.images?.length ? <p className="py-6 text-center text-sm text-gray-500">لا توجد صور مسجلة لهذا المنتج.</p> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[...selected.images].sort((a, b) => a.sortOrder - b.sortOrder).map((image) => (
                      <div key={image.id} className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)" }}>
                        <img src={image.imageUrl} alt="" className="h-44 w-full object-cover" />
                        <div className="flex flex-wrap items-center justify-between gap-1 p-2 text-xs">
                          <span>ترتيب {image.sortOrder + 1}</span>
                          <div className="flex gap-1">
                            <button type="button" disabled={busy || image.sortOrder === 0} onClick={() => void moveImage(image, -1)} title="تحريك للأمام">←</button>
                            <button type="button" disabled={busy || image.sortOrder === selected.images!.length - 1} onClick={() => void moveImage(image, 1)} title="تحريك للخلف">→</button>
                            <button type="button" disabled={busy} onClick={() => void removeImage(image)} className="text-red-700">حذف</button>
                          </div>
                        </div>
                        <label className="block px-2 pb-2 text-xs">صورة لـ
                          <select value={image.colorId ?? ""} disabled={busy} onChange={(event) => void setImageColor(image, event.target.value ? Number(event.target.value) : null)} className="mt-1 w-full rounded-lg border p-2 text-xs">
                            <option value="">كل الألوان</option>
                            {(selected.colors ?? []).map((color) => <option key={color.id} value={color.id}>{color.nameAr || color.nameEn}</option>)}
                          </select>
                        </label>
                      </div>
                    ))}</div>}
                  </section>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
