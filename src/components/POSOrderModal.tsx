import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Product, RestaurantTable } from '../types/database';
import { X, Plus, Minus, Send, Coffee } from 'lucide-react';

interface CartItem {
  product: Product;
  quantity: number;
}

interface POSOrderModalProps {
  table: RestaurantTable;
  waiterName?: string;
  onClose: () => void;
  onOrderSuccess: () => void;
}

export function POSOrderModal({
  table,
  waiterName = 'Garzón',
  onClose,
  onOrderSuccess,
}: POSOrderModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');

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

  const totalWithIva = cart.reduce((acc, it) => acc + it.product.price * it.quantity, 0);
  const subtotal_net = Math.round(totalWithIva / 1.19);
  const iva_amount = totalWithIva - subtotal_net;

const handleConfirmOrder = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);

    try {
      // 1. Obtener turno de caja abierto si existe
      const { data: openShift } = await supabase
        .from('cash_shifts')
        .select('id')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 2. Crear Orden sin campos conflictivos
      const orderPayload: Record<string, any> = {
        table_id: table.id,
        shift_id: openShift?.id || null,
        waiter_name: waiterName,
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

      // 3. Registrar ítems de la comanda
      const itemsToInsert = cart.map((it) => ({
        order_id: orderData.id,
        product_id: it.product.id,
        quantity: it.quantity,
        unit_price: it.product.price,
        subtotal: it.product.price * it.quantity,
        status: 'pending',
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // 4. Cambiar estado de la mesa a ocupada
      await supabase
        .from('restaurant_tables')
        .update({ status: 'occupied' })
        .eq('id', table.id);

      onOrderSuccess();
    } catch (err: any) {
      alert('Error enviando comanda: ' + (err?.message || 'Error de red'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden">
        
        {/* Catálogo de Productos */}
        <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-zinc-800 p-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Coffee className="w-4 h-4 text-emerald-400" />
                Tomar Pedido — {table.name}
              </h2>
              <p className="text-[11px] text-zinc-400 font-mono">
                Atendido por: <strong className="text-amber-400">{waiterName}</strong>
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Categorías */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  activeCategory === cat
                    ? 'bg-emerald-500 text-zinc-950 shadow'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grid de Productos */}
          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2.5 pr-1">
            {loading ? (
              <div className="col-span-full py-16 text-center text-xs font-mono text-zinc-500 animate-pulse">
                Cargando carta...
              </div>
            ) : (
              filteredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="p-3 bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800 rounded-xl text-left flex flex-col justify-between transition active:scale-95 group"
                >
                  <span className="text-xs font-semibold text-zinc-200 line-clamp-2">{p.name}</span>
                  <div className="mt-3 flex justify-between items-center w-full">
                    <span className="text-xs font-bold font-mono text-emerald-400 tabular-nums">
                      ${p.price.toLocaleString('es-CL')}
                    </span>
                    <span className="p-1 rounded-lg bg-zinc-800 group-hover:bg-emerald-500 group-hover:text-zinc-950 transition">
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Canasta */}
        <div className="w-full md:w-80 bg-zinc-950/60 p-4 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Comanda Actual
              </span>
              <span className="text-xs font-mono text-zinc-500">{cart.length} ítem(s)</span>
            </div>

            <div className="space-y-2 max-h-[40vh] md:max-h-[50vh] overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-12">No hay platos seleccionados.</p>
              ) : (
                cart.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-xs font-medium text-zinc-200 truncate">{product.name}</p>
                      <span className="text-[11px] font-mono text-zinc-400">
                        ${(product.price * quantity).toLocaleString('es-CL')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => removeFromCart(product.id)}
                        className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-5 text-center text-xs font-bold font-mono text-zinc-100">
                        {quantity}
                      </span>
                      <button
                        onClick={() => addToCart(product)}
                        className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <div className="space-y-1 font-mono text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Neto:</span>
                <span>${subtotal_net.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>IVA (19%):</span>
                <span>${iva_amount.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-emerald-400 pt-1 border-t border-zinc-800">
                <span>Total:</span>
                <span className="tabular-nums">${totalWithIva.toLocaleString('es-CL')}</span>
              </div>
            </div>

            <button
              onClick={handleConfirmOrder}
              disabled={cart.length === 0 || submitting}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-lg"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Marchando...' : 'Enviar a Cocina'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}