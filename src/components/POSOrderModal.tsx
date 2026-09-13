import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Product, RestaurantTable } from '../types/database';
import { X, Plus, Minus, Send, Coffee, ShoppingBag, User } from 'lucide-react';

interface CartItem {
  product: Product;
  quantity: number;
}

interface POSOrderModalProps {
  table?: RestaurantTable | null;
  isTakeout?: boolean;
  waiterName?: string;
  onClose: () => void;
  onOrderSuccess: () => void;
}

export function POSOrderModal({
  table,
  isTakeout = false,
  waiterName = 'Garzón',
  onClose,
  onOrderSuccess,
}: POSOrderModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [customerName, setCustomerName] = useState<string>('');

  const isTakeoutOrder = isTakeout || !table;

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (!error && data) {
        setProducts(data as Product[]);
      }
      setLoading(false);
    }
    loadProducts();
  }, []);

  const categories = ['Todos', ...Array.from(new Set(products.map((p) => p.category || 'General')))];

  const filteredProducts =
    activeCategory === 'Todos'
      ? products
      : products.filter((p) => (p.category || 'General') === activeCategory);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const cleanPrice = (price: any): number => {
    if (typeof price === 'number') return price;
    if (!price) return 0;
    const cleaned = String(price).replace(/[^0-9]/g, '');
    return Number(cleaned) || 0;
  };

  const totalWithIva = cart.reduce(
    (acc, it) => acc + cleanPrice(it.product?.price) * (Number(it.quantity) || 1),
    0
  );
  const subtotal_net = Math.round(totalWithIva / 1.19);
  const iva_amount = totalWithIva - subtotal_net;
  const totalItemsCount = cart.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);

  const handleConfirmOrder = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);

    try {
      const { data: openShift } = await supabase
        .from('cash_shifts')
        .select('id')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const finalCustomer = customerName.trim() || 'Cliente Mostrador';
      const orderPayload: Record<string, any> = {
        table_id: table ? table.id : null,
        shift_id: openShift?.id || null,
        waiter_name: isTakeoutOrder ? `Para Llevar • ${finalCustomer}` : waiterName,
        subtotal_net,
        iva_amount,
        tip_amount: 0,
        total_amount: totalWithIva,
        status: 'open',
      };

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select()
        .single();

      if (orderError) throw orderError;

      const itemsToInsert = cart.map((it) => ({
        order_id: orderData.id,
        product_id: it.product.id,
        quantity: it.quantity,
        unit_price: cleanPrice(it.product.price),
        subtotal: cleanPrice(it.product.price) * it.quantity,
        status: 'pending',
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      if (table) {
        await supabase
          .from('restaurant_tables')
          .update({ status: 'occupied' })
          .eq('id', table.id);
      }

      onOrderSuccess();
    } catch (err: any) {
      alert('Error enviando comanda: ' + (err?.message || 'Error de red'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col md:items-center md:justify-center md:p-4">
      {/* Contenedor Adaptativo */}
      <div className="bg-zinc-950 md:bg-zinc-900 border-zinc-800 w-full h-full md:h-[88vh] md:max-w-4xl md:rounded-2xl md:border shadow-2xl flex flex-col overflow-hidden">
        
        {/* Cabecera Fija */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0 bg-zinc-900/90">
          <div>
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              {isTakeoutOrder ? (
                <>
                  <span className="p-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                    <ShoppingBag className="w-4 h-4" />
                  </span>
                  Para Llevar
                </>
              ) : (
                <>
                  <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Coffee className="w-4 h-4" />
                  </span>
                  {table?.name}
                </>
              )}
            </h2>
            <p className="text-[11px] text-zinc-400 font-mono">
              Atiende: <strong className="text-amber-400">{waiterName}</strong>
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded-xl transition cursor-pointer active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Campo de cliente si es Para Llevar */}
        {isTakeoutOrder && (
          <div className="p-3 bg-violet-950/20 border-b border-violet-500/20 shrink-0">
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5">
              <User className="w-4 h-4 text-violet-400 shrink-0" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre del cliente para el retiro..."
                className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Categorías Fijas */}
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 border-b border-zinc-800 shrink-0 bg-zinc-900/50">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeCategory === cat
                  ? 'bg-emerald-500 text-zinc-950 font-bold shadow-xs'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Área Central con Scroll Completo y Libre */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          
          {/* 1. Catálogo de Platos */}
          <div>
            <div className="text-[11px] font-mono text-zinc-400 uppercase font-bold tracking-wider mb-2">
              Toca para agregar a la comanda:
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {loading ? (
                <div className="col-span-full py-10 text-center text-xs font-mono text-zinc-500 animate-pulse">
                  Cargando carta...
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const itemInCart = cart.find((it) => it.product.id === p.id);
                  const qty = itemInCart?.quantity || 0;
                  const isSelected = qty > 0;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addToCart(p)}
                      className={`p-3 rounded-xl text-left flex flex-col justify-between transition-all active:scale-95 cursor-pointer border ${
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-500 shadow-md shadow-emerald-500/10'
                          : 'bg-zinc-900 hover:bg-zinc-800/80 border-zinc-800'
                      }`}
                    >
                      <div className="w-full">
                        <div className="flex justify-between items-start gap-1">
                          <span className="text-xs font-bold text-zinc-200 line-clamp-2 leading-tight">
                            {p.name}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-500 text-zinc-950 font-black font-mono text-[10px] shrink-0">
                              {qty}x
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex justify-between items-center w-full">
                        <span className="text-xs font-bold font-mono text-emerald-400 tabular-nums">
                          ${cleanPrice(p.price).toLocaleString('es-CL')}
                        </span>
                        
                        {/* Botón siempre verde cuando está seleccionado */}
                        <span className={`p-1.5 rounded-lg transition-colors ${
                          isSelected 
                            ? 'bg-emerald-500 text-zinc-950 font-bold' 
                            : 'bg-zinc-800 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 2. Lista Detallada de la Comanda */}
          <div className="pt-2 border-t border-zinc-800">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-[11px] font-mono font-bold uppercase text-zinc-300">
                Platos en Comanda:
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {totalItemsCount} unidad(es)
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-zinc-800 rounded-xl">
                <p className="text-xs text-zinc-500 font-mono">Toca los platos de arriba para comenzar.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-xs font-bold text-zinc-200 truncate">{product.name}</p>
                      <span className="text-xs font-mono text-emerald-400 font-bold">
                        ${(cleanPrice(product.price) * quantity).toLocaleString('es-CL')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => removeFromCart(product.id)}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer active:scale-90"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-xs font-black font-mono text-zinc-100">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer active:scale-90"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PIE DE PÁGINA FIJO (STICKY FOOTER): NUNCA SE SALE DE LA PANTALLA */}
        <div className="shrink-0 bg-zinc-900 border-t border-zinc-800 p-3.5 shadow-2xl">
          <div className="flex justify-between items-center mb-2.5 text-xs font-mono px-1">
            <span className="text-zinc-400">
              Neto: ${subtotal_net.toLocaleString('es-CL')} + IVA: ${iva_amount.toLocaleString('es-CL')}
            </span>
            <span className="text-base font-black text-emerald-400">
              ${totalWithIva.toLocaleString('es-CL')}
            </span>
          </div>

          <button
            type="button"
            onClick={handleConfirmOrder}
            disabled={cart.length === 0 || submitting}
            className={`w-full py-3.5 font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg cursor-pointer ${
              cart.length === 0
                ? 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed'
                : isTakeoutOrder
                ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-600/30'
                : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/30'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>
              {submitting
                ? 'Marchando comanda...'
                : isTakeoutOrder
                ? `Marchar Para Llevar ($${totalWithIva.toLocaleString('es-CL')})`
                : `Enviar a Cocina ($${totalWithIva.toLocaleString('es-CL')})`}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
}