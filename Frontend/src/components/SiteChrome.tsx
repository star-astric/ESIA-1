import { useState, type ReactNode } from "react";
import type { CatalogProduct } from "../data/catalog";
import { useCategories } from "../lib/categoryContext";

interface ChromeProps {
  view: string;
  onNavigate: (view: string, productId?: string) => void;
  cart: number;
  showGuestSignIn?: boolean;
  children: ReactNode;
}

export function SiteChrome({
  view,
  onNavigate,
  cart,
  showGuestSignIn,
  children,
}: ChromeProps) {
  const { categories } = useCategories();
  const links = [
    { view: "home", label: "الرئيسية" },
    ...categories.map((category) => ({
      view: "category:" + category.slug,
      label: category.name,
    })),
  ];
  const activeView = view === "product" ? "home" : view;

  return (
    <div className="flex min-h-full flex-col" style={{ background: "var(--page-pink)" }}>
      <header className="fixed inset-x-0 top-0 z-40 border-b bg-white/95 backdrop-blur-sm" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto flex h-[88px] max-w-[1260px] items-center justify-between gap-4 px-4">
          <nav className="hidden items-center gap-5 md:flex">
            {links.map((link) => (
              <button key={link.view} type="button" onClick={() => onNavigate(link.view)}
                className="bg-transparent p-0 text-sm font-medium"
                style={{ color: activeView === link.view ? "var(--rose-deep)" : "var(--plum-soft)" }}>
                {link.label}
              </button>
            ))}
          </nav>
          <button type="button" onClick={() => onNavigate("home")} className="flex flex-1 justify-center border-0 bg-transparent">
            <BrandLogo />
          </button>
          <div className="flex items-center gap-2">
            {showGuestSignIn ? (
              <button type="button" onClick={() => onNavigate("auth")} className="rounded-full px-3 py-2 text-xs font-bold text-white" style={{ background: "var(--rose-deep)" }}>
                تسجيل الدخول
              </button>
            ) : (
              <button type="button" onClick={() => onNavigate("profile")} aria-label="حسابي" className="rounded-full border bg-white px-4 py-2 text-xs font-bold" style={{ borderColor: "var(--line)", color: "var(--plum)" }}>
                👤 حسابي
              </button>
            )}
            <button type="button" onClick={() => onNavigate("checkout")} aria-label="السلة" className="relative rounded-xl border bg-white px-3 py-2" style={{ borderColor: "var(--line)", color: "var(--plum)" }}>
              <span aria-hidden="true">🛍</span>
              {cart > 0 && <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: "var(--rose-deep)" }}>{cart}</span>}
            </button>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-3 md:hidden">
          {links.map((link) => (
            <button key={link.view} type="button" onClick={() => onNavigate(link.view)} className="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs"
              style={activeView === link.view ? { background: "var(--rose-deep)", borderColor: "var(--rose-deep)", color: "#fff" } : { borderColor: "var(--line)", color: "var(--plum-soft)" }}>
              {link.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 pt-[120px] md:pt-[104px]">{children}</main>
      <footer className="mt-12 border-t px-5 py-8" style={{ borderColor: "var(--line)", background: "var(--page-pink)" }}>
        <div className="mx-auto flex max-w-[1260px] flex-wrap items-center justify-between gap-4 text-xs" style={{ color: "var(--plum-soft)" }}>
          <span>جميع الحقوق محفوظة © إيسيا</span>
          <div className="flex flex-wrap gap-4">
            <button type="button" className="bg-transparent p-0" onClick={() => onNavigate("track-order")}>تتبّع طلبك</button>
            <button type="button" className="bg-transparent p-0" onClick={() => onNavigate("my-orders")}>طلباتي</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function ProductCard({ item, onOpen }: { item: CatalogProduct; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(item.id)} className="group w-full overflow-hidden rounded-2xl bg-white text-right"
      style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-card)" }}>
      <div className="relative overflow-hidden bg-[#f5e9e8]" style={{ aspectRatio: "3/4" }}>
        {item.img ? <img src={item.img} alt={item.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center px-5 text-center" style={{ color: "var(--plum-soft)" }}>{item.name}</div>}
        {item.tag && <span className="absolute end-2.5 top-2.5 rounded-full px-2 py-1 text-[10px] font-bold text-white" style={{ background: item.tag.toLowerCase().includes("new") ? "var(--sage-deep)" : "var(--rose-deep)" }}>{item.tag}</span>}
      </div>
      <div className="p-3.5">
        <div className="font-marcellus text-[9px] tracking-[0.14em]" style={{ color: "var(--gold)" }}>ESIA</div>
        <div className="mt-1 text-sm font-semibold" style={{ color: "var(--plum)" }}>{item.name}</div>
        {item.sub && <div className="mt-0.5 text-[11px]" style={{ color: "var(--gray)" }}>{item.sub}</div>}
        <div className="mt-2 flex items-center gap-1.5">
          {item.colors.map((color, index) => <span key={color.backendId ?? index} className="h-3 w-3 rounded-full" style={{ background: color.hexCode ?? color.color, boxShadow: "0 0 0 1px var(--line)" }} title={color.nameAr || color.nameEn} />)}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-sm font-bold" style={{ color: "var(--rose-deep)" }}>{item.price.toLocaleString()} ج.م</span>
          {item.originalPrice !== null && <span className="text-xs line-through" style={{ color: "var(--gray)" }}>{item.originalPrice.toLocaleString()} ج.م</span>}
        </div>
      </div>
    </button>
  );
}

function BrandLogo() {
  const [failed, setFailed] = useState(false);
  return failed
    ? <span className="font-marcellus text-2xl tracking-[0.16em]" style={{ color: "var(--rose-deep)" }}>ESIA</span>
    : <img src="/esia-brand.png?v=6" alt="ESIA Couture" className="h-[60px] w-[150px] object-contain sm:h-16 sm:w-40" onError={() => setFailed(true)} />;
}
