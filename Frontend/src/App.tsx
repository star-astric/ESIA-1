import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import ProductDetail from "./components/ProductDetail";
import AdminOrders from "./components/AdminOrders";
import AdminProducts from "./components/AdminProducts";
import AdminCatalog from "./components/AdminCatalog";
import Checkout from "./components/Checkout";
import Storefront from "./components/Storefront";
import AuthPage from "./components/AuthPage";
import CheckEmail, { clearPendingEmail, rememberPendingEmail } from "./components/CheckEmail";
import MyOrders from "./components/MyOrders";
import Profile from "./components/Profile";
import TrackOrder from "./components/TrackOrder";
import EmailVerification from "./components/EmailVerification";
import ResetPassword from "./components/ResetPassword";
import { useAuthSession } from "./lib/authSession";
import { getApiErrorMessage } from "./lib/api";
import { CategoriesProvider } from "./lib/categoryContext";
import { cartService } from "./services/cart";
import { ordersService } from "./services/orders";
import { DEFAULT_PAYMENT_METHOD } from "./lib/storeConfig";

export interface CartItem {
  variantKey: string;
  backendItemId: number;
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
}

type AddCartItem = Omit<CartItem, "variantKey" | "backendItemId">;

function mapCart(data: any): CartItem[] {
  if (data?.guestToken) localStorage.setItem("esia-guest-token", String(data.guestToken));
  if (!Array.isArray(data?.items)) return [];
  return data.items.map((item: any) => ({
    variantKey: String(item.id),
    backendItemId: Number(item.id),
    productId: String(item.productId),
    name: String(item.productName ?? item.product?.name ?? "Product"),
    price: Number(item.unitPrice ?? item.product?.price ?? 0),
    size: String(item.size ?? ""),
    color: String(item.color?.nameAr ?? item.color?.nameEn ?? "—"),
    colorNameEn: String(item.color?.nameEn ?? ""),
    colorNameAr: String(item.color?.nameAr ?? ""),
    colorHex: String(item.color?.hexCode ?? ""),
    colorId: item.colorId ? Number(item.colorId) : undefined,
    image: String(item.productImage ?? item.product?.coverImageUrl ?? ""),
    qty: Number(item.quantity ?? 0),
  }));
}

function ProductRoute({
  cart,
  onAddToCart,
  onNavigate,
  showGuestSignIn,
}: {
  cart: number;
  onAddToCart: (item: AddCartItem) => Promise<void>;
  onNavigate: (view: string, value?: string) => void;
  showGuestSignIn: boolean;
}) {
  const { productId } = useParams();
  if (!productId) return <Navigate to="/" replace />;
  return <ProductDetail key={productId} productId={productId} onNavigate={onNavigate} cart={cart} onAddToCart={onAddToCart} showGuestSignIn={showGuestSignIn} />;
}

function CategoryRoute(props: Omit<ComponentProps<typeof Storefront>, "view" | "categorySlug">) {
  const { slug } = useParams();
  return <Storefront {...props} view="category" categorySlug={slug} />;
}

function TrackedOrderRoute({ onNavigate }: { onNavigate: (view: string, value?: string) => void }) {
  const { orderNumber } = useParams();
  return <TrackOrder key={orderNumber ?? "lookup"} initialOrderNumber={orderNumber} onNavigate={onNavigate} />;
}

function ProtectedRoute({ user, isLoading, role, children }: { user: any; isLoading: boolean; role?: "user" | "admin"; children: ReactNode }) {
  const location = useLocation();
  if (isLoading) return <main className="grid min-h-screen place-items-center">جارٍ التحقق من الجلسة...</main>;
  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={user.role === "admin" ? "/admin-orders" : "/"} replace />;
  return <>{children}</>;
}

function AppAuthShell() {
  const auth = useAuthSession();
  return <AppShell {...auth} />;
}

function AppShell({
  user,
  isLoading,
  signIn,
  signUp,
  signOut,
  error,
  refreshProfile,
}: {
  user: any;
  isLoading: boolean;
  signIn: { emailPassword: (input: { email: string; password: string }) => Promise<any> };
  signUp: { emailPassword: (input: { email: string; password: string; name?: string; phone?: string }) => Promise<any> };
  signOut: { signOut: () => Promise<void> };
  error: { message: string } | null;
  refreshProfile?: () => Promise<unknown>;
}) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState<string | null>(null);
  const guestCartItems = useRef<CartItem[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  const loadCart = useCallback(async () => {
    setCartLoading(true);
    setCartError(null);
    try {
      if (user?.role === "user") {
        const guestData = guestCartItems.current.length > 0 ? null : await cartService.getGuestCart();
        const guestItems = guestCartItems.current.length > 0 ? guestCartItems.current : mapCart(guestData);
        // Capture the guest token before dropping it so the server can delete
        // the absorbed guest cart row after merging into the DB user cart.
        const guestToken = localStorage.getItem("esia-guest-token");
        if (guestItems.length > 0) await cartService.merge(guestItems.map((item) => ({
          productId: Number(item.productId),
          quantity: item.qty,
          colorId: item.colorId,
          size: item.size || undefined,
        })), guestToken);
        guestCartItems.current = [];
        localStorage.removeItem("esia-guest-token");
      }
      const cart = await cartService.get();
      const mappedItems = mapCart(cart);
      if (!user) guestCartItems.current = mappedItems;
      setCartItems(mappedItems);
    } catch (loadError) {
      setCartError(getApiErrorMessage(loadError));
    } finally {
      setCartLoading(false);
    }
  }, [user?.$id]);

  useEffect(() => {
    if (!isLoading) void loadCart();
  }, [isLoading, user?.$id, loadCart]);

  useEffect(() => {
    if (isLoading || !user || location.pathname !== "/auth") return;
    clearPendingEmail();
    const requestedPath = (location.state as { from?: string } | null)?.from;
    const canReturnToRequestedPath = requestedPath && (
      user.role === "admin"
        ? requestedPath.startsWith("/admin-")
        : !requestedPath.startsWith("/admin-") && requestedPath !== "/auth"
    );
    navigate(canReturnToRequestedPath ? requestedPath : user.role === "admin" ? "/admin-orders" : "/", { replace: true });
  }, [isLoading, user, location.pathname, location.state, navigate]);

  const redirect = useCallback((view: string, value?: string) => {
    let target = "/";
    if (view.startsWith("category:")) target = "/category/" + encodeURIComponent(view.slice("category:".length));
    else if (view.startsWith("track-order:")) target = "/track-order/" + encodeURIComponent(view.slice("track-order:".length));
    else if (view === "home") target = "/";
    else if (view === "dresses" || view === "bags" || view === "accessories") target = "/category/" + view;
    else if (view === "product") target = value ? "/product/" + encodeURIComponent(value) : "/";
    else if (view === "checkout") target = "/checkout";
    else if (view === "auth") target = "/auth";
    else if (view === "check-email") {
      if (value) rememberPendingEmail(value);
      navigate("/check-email", value ? { state: { email: value } } : undefined);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    else if (view === "my-orders") target = "/my-orders";
    else if (view === "profile") target = "/profile";
    else if (view === "track-order") target = value ? "/track-order/" + encodeURIComponent(value) : "/track-order";
    else if (view === "admin-orders") target = "/admin-orders";
    else if (view === "admin-products") target = "/admin-products";
    else if (view === "admin-catalog") target = "/admin-catalog";
    navigate(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [navigate]);

  const applyCart = (data: any) => {
    const mappedItems = mapCart(data);
    if (!user) guestCartItems.current = mappedItems;
    setCartItems(mappedItems);
    setCartError(null);
  };

  const addToCart = async (item: AddCartItem) => {
    try {
      const cart = await cartService.add({
        productId: Number(item.productId),
        quantity: item.qty,
        colorId: item.colorId,
        size: item.size || undefined,
      });
      applyCart(cart);
    } catch (addError) {
      setCartError(getApiErrorMessage(addError));
      throw addError;
    }
  };

  const updateItemQty = async (itemId: number, quantity: number) => {
    try {
      const cart = quantity <= 0
        ? await cartService.remove(itemId)
        : await cartService.update(itemId, quantity);
      applyCart(cart);
    } catch (updateError) {
      setCartError(getApiErrorMessage(updateError));
      throw updateError;
    }
  };

  const removeItem = async (itemId: number) => {
    try {
      applyCart(await cartService.remove(itemId));
    } catch (removeError) {
      setCartError(getApiErrorMessage(removeError));
      throw removeError;
    }
  };

  const clearCart = async () => {
    try {
      await cartService.clear();
      setCartItems([]);
      setCartError(null);
    } catch (clearError) {
      setCartError(getApiErrorMessage(clearError));
      throw clearError;
    }
  };

  const placeOrder = async (payload: {
    customerName: string;
    email: string;
    phone: string;
    address: string;
    city?: string;
    items: CartItem[];
    total: number;
    senderName: string;
    senderNumber: string;
    paymentAmount: number;
    proofFile: File;
    notes?: string;
  }) => {
    const formData = new FormData();
    formData.append("customerName", payload.customerName);
    formData.append("email", payload.email);
    formData.append("phone", payload.phone);
    formData.append("address", payload.address);
    if (payload.city) formData.append("city", payload.city);
    if (payload.notes) formData.append("notes", payload.notes);
    formData.append("totalAmount", String(payload.total));
    formData.append("items", JSON.stringify(payload.items.map((item) => ({
        productId: Number(item.productId),
        productName: item.name,
        name: item.name,
        unitPrice: item.price,
        price: item.price,
        quantity: item.qty,
        qty: item.qty,
        size: item.size || undefined,
        colorId: item.colorId,
      }))));
    formData.append("paymentMethod", DEFAULT_PAYMENT_METHOD);
    formData.append("senderName", payload.senderName);
    formData.append("senderNumber", payload.senderNumber);
    formData.append("paymentAmount", String(payload.paymentAmount));
    formData.append("proofImage", payload.proofFile);
    const response = await ordersService.create(formData);
    const orderNumber = response?.order?.orderNumber;
    if (!orderNumber) throw new Error("The server did not return an order number.");
    return String(orderNumber);
  };

  const logout = async () => {
    await signOut.signOut();
    navigate("/auth", { replace: true });
  };
  const cartCount = useMemo(() => cartItems.reduce((sum, item) => sum + item.qty, 0), [cartItems]);

  if (isLoading) {
    return <main className="grid min-h-screen place-items-center bg-[#fff8f7] text-[#382530]" role="status">جارٍ تحميل الجلسة...</main>;
  }
  if (user?.role === "admin" && !location.pathname.startsWith("/admin-") && !["/auth", "/verify-email", "/reset-password"].includes(location.pathname)) {
    return <Navigate to="/admin-orders" replace />;
  }

  const sharedStoreProps = {
    onNavigate: redirect,
    cart: cartCount,
    showGuestSignIn: !user,
  };

  return (
    <Routes>
      <Route path="/" element={<Storefront view="home" {...sharedStoreProps} />} />
      <Route path="/dresses" element={<Storefront view="category" categorySlug="dresses" {...sharedStoreProps} />} />
      <Route path="/bags" element={<Storefront view="category" categorySlug="bags" {...sharedStoreProps} />} />
      <Route path="/accessories" element={<Storefront view="category" categorySlug="accessories" {...sharedStoreProps} />} />
      <Route path="/category/:slug" element={<CategoryRoute {...sharedStoreProps} />} />
      <Route path="/product/:productId" element={<ProductRoute cart={cartCount} onAddToCart={addToCart} onNavigate={redirect} showGuestSignIn={!user} />} />
      <Route path="/checkout" element={<Checkout items={cartItems} loading={cartLoading} cartError={cartError} savedInfo={user?.role === "user" ? { name: user.name, email: user.email, phone: user.phone, address: user.address, city: user.city } : null} onRetryCart={loadCart} onNavigate={redirect} onRemoveItem={removeItem} onUpdateQty={updateItemQty} onClearCart={clearCart} onPlaceOrder={placeOrder} />} />
      <Route path="/track-order" element={<TrackOrder onNavigate={redirect} />} />
      <Route path="/track-order/:orderNumber" element={<TrackedOrderRoute onNavigate={redirect} />} />
      <Route path="/auth" element={<AuthPage user={user} isLoading={isLoading} signIn={signIn} signUp={signUp} signOut={signOut} error={error} onContinueAsGuest={() => navigate("/", { replace: true })} onRequireVerification={(email) => redirect("check-email", email)} />} />
      <Route path="/check-email" element={<CheckEmail />} />
      <Route path="/verify-email" element={<EmailVerification />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/my-orders" element={<ProtectedRoute user={user} isLoading={isLoading} role="user"><MyOrders onNavigate={redirect} /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute user={user} isLoading={isLoading} role="user"><Profile user={user} onNavigate={redirect} onLogout={logout} onRefreshUser={refreshProfile} /></ProtectedRoute>} />
      <Route path="/admin-orders" element={<ProtectedRoute user={user} isLoading={isLoading} role="admin"><AdminOrders onNavigate={redirect} onLogout={logout} /></ProtectedRoute>} />
      <Route path="/admin-products" element={<ProtectedRoute user={user} isLoading={isLoading} role="admin"><AdminProducts onNavigate={redirect} onLogout={logout} /></ProtectedRoute>} />
      <Route path="/admin-catalog" element={<ProtectedRoute user={user} isLoading={isLoading} role="admin"><AdminCatalog onNavigate={redirect} onLogout={logout} /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <CategoriesProvider>
        <AppAuthShell />
      </CategoriesProvider>
    </BrowserRouter>
  );
}
