import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Product } from '../types/database';
import { 
  X, UserCheck, Clock, Utensils, LogOut, 
  CheckCircle2, ArrowRight, Delete, Plus, Minus, ShoppingBag 
} from 'lucide-react';

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  pin_code: string;
}

interface StaffPortalModalProps {
  currentStaff: StaffMember;
  onSelectStaff: (staff: StaffMember) => void;
  onClose: () => void;
  isDark?: boolean;
}

interface MealItem {
  product: Product;
  quantity: number;
}

export function StaffPortalModal({ 
  currentStaff, 
  onSelectStaff, 
  onClose, 
  isDark = true 
}: StaffPortalModalProps) {
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [authenticatedStaff, setAuthenticatedStaff] = useState<StaffMember | null>(null);
  
  // Vistas internas: pin -> menu -> meal_selector
  const [step, setStep] = useState<'pin' | 'actions' | 'meal'>('pin');
  
  // Canasta de colación (permite múltiples ítems: plato + bebida)
  const [products, setProducts] = useState<Product[]>([]);
  const [mealCart, setMealCart] = useState<MealItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadProducts() {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (data) setProducts(data as Product[]);
    }
    loadProducts();
  }, []);

  const handleNumClick = async (num: string) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      setPinError(false);

      if (nextPin.length === 4) {
        const { data, error } = await supabase
          .from('staff')
          .select('*')
          .eq('pin_code', nextPin)
          .maybeSingle();

        if (!error && data) {
          setAuthenticatedStaff(data as StaffMember);
          setStep('actions');
        } else {
          setPinError(true);
          setTimeout(() => {
            setPin('');
            setPinError(false);
          }, 700);
        }
      }
    }
  };

  const handleAttendanceEvent = async (eventType: 'clock_in' | 'clock_out' | 'break_start' | 'break_end') => {
    if (!authenticatedStaff) return;
    setSubmitting(true);

    try {
      const labels = {
        clock_in: 'Entrada registrada con éxito',
        clock_out: 'Salida de turno registrada',
        break_start: 'Inicio de colación registrado',
        break_end: 'Regreso de colación registrado',
      };

      const { error } = await supabase.from('staff_attendance').insert({
        staff_id: authenticatedStaff.id,
        event_type: eventType,
      });

      if (error) throw error;

      setSuccessMessage(labels[eventType]);
      setTimeout(() => {
        onSelectStaff(authenticatedStaff);
        onClose();
      }, 1200);
    } catch (err: any) {
      alert('Error registrando marca: ' + (err?.message || 'Error de red'));
    } finally {
      setSubmitting(false);
    }
  };

  const addToMealCart = (product: Product) => {
    setMealCart((prev) => {
      const existing = prev.find((it) => it.product.id === product.id);
      if (existing) {
        return prev.map((it) =>
          it.product.id === product.id ? { ...it, quantity: it.quantity + 1 } : it
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromMealCart = (productId: string) => {
    setMealCart((prev) =>
      prev
        .map((it) =>
          it.product.id === productId ? { ...it, quantity: it.quantity - 1 } : it
        )
        .filter((it) => it.quantity > 0)
    );
  };

  const realTotalCost = mealCart.reduce(
    (acc, it) => acc + it.product.price * it.quantity,
    0
  );

  const handleConfirmStaffMeal = async () => {
    if (!authenticatedStaff || mealCart.length === 0 || submitting) return;
    setSubmitting(true);

    try {
      // 1. Obtener turno de caja abierto
      const { data: openShift } = await supabase
        .from('cash_shifts')
        .select('id')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 2. Crear orden a costo $0 para descontar insumos sin alterar caja
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          shift_id: openShift?.id || null,
          staff_id: authenticatedStaff.id,
          waiter_name: `Colación • ${authenticatedStaff.name}`,
          is_staff_meal: true,
          subtotal_net: 0,
          iva_amount: 0,
          tip_amount: 0,
          total_amount: 0,
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 3. Registrar ítems en batch para cocina y recetas de insumos
      const itemsPayload = mealCart.map((it) => ({
        order_id: orderData.id,
        product_id: it.product.id,
        quantity: it.quantity,
        unit_price: 0,
        subtotal: 0,
        status: 'pending',
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(itemsPayload);
      if (itemsError) throw itemsError;

      setSuccessMessage(`Colación de ${mealCart.length} ítem(s) enviada a cocina`);
      setTimeout(() => {
        onSelectStaff(authenticatedStaff);
        onClose();
      }, 1400);
    } catch (err: any) {
      alert('Error registrando colación: ' + (err?.message || 'Error de base de datos'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
      <div className={`w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 border transition-all ${
        isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Encabezado */}
        <div className={`flex items-center justify-between border-b pb-2.5 ${
          isDark ? 'border-zinc-800' : 'border-slate-100'
        }`}>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20">
              <UserCheck className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm">Portal de Personal</h3>
              <p className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Asistencia, colaciones y turnos
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              isDark ? 'text-zinc-400 hover:text-zinc-100 bg-zinc-800/60' : 'text-slate-400 hover:text-slate-800 bg-slate-100'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Paso 1: Ingreso de PIN Personal */}
        {step === 'pin' && (
          <div className="flex flex-col items-center space-y-4 py-1">
            <div className="text-center space-y-0.5">
              <p className={`text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Digita tu PIN de 4 dígitos para identificarte
              </p>
              {currentStaff && (
                <p className={`text-[11px] font-mono ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                  Operador actual: <span className="text-blue-500 font-bold">{currentStaff.name}</span>
                </p>
              )}
            </div>

            <div className="flex gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full transition-all ${
                    pinError
                      ? 'bg-rose-500 animate-shake'
                      : pin.length > i
                      ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                      : isDark ? 'bg-zinc-800 border border-zinc-700' : 'bg-slate-200 border border-slate-300'
                  }`}
                />
              ))}
            </div>

            {pinError && (
              <span className="text-xs font-mono text-rose-500 font-bold">PIN incorrecto</span>
            )}

            <div className="grid grid-cols-3 gap-2.5 w-full pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                <button
                  key={n}
                  onClick={() => handleNumClick(n)}
                  className={`h-12 rounded-xl font-mono font-bold text-base border transition-all active:scale-95 cursor-pointer ${
                    isDark 
                      ? 'bg-zinc-950/80 border-zinc-800 text-zinc-100 hover:bg-zinc-800' 
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100 shadow-2xs'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPin('')}
                className={`h-12 rounded-xl border flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  isDark ? 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-zinc-200' : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                <Delete className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleNumClick('0')}
                className={`h-12 rounded-xl font-mono font-bold text-base border transition-all active:scale-95 cursor-pointer ${
                  isDark 
                    ? 'bg-zinc-950/80 border-zinc-800 text-zinc-100 hover:bg-zinc-800' 
                    : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100 shadow-2xs'
                }`}
              >
                0
              </button>
              <div className="h-12" />
            </div>
          </div>
        )}

        {/* Paso 2: Menú de Acciones */}
        {step === 'actions' && authenticatedStaff && (
          <div className="space-y-3.5">
            <div className={`p-3 rounded-2xl border text-center ${
              isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-[10px] font-mono text-emerald-500 font-bold uppercase tracking-wider">Identificado</span>
              <h4 className="text-base font-extrabold">{authenticatedStaff.name}</h4>
              <p className={`text-xs capitalize ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Rol: {authenticatedStaff.role}</p>
            </div>

            {successMessage ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{successMessage}</p>
              </div>
            ) : (
              <div className="space-y-2 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAttendanceEvent('clock_in')}
                    disabled={submitting}
                    className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex flex-col items-center gap-1 transition-all active:scale-95 shadow-2xs cursor-pointer"
                  >
                    <Clock className="w-4 h-4" />
                    Marcar Entrada
                  </button>

                  <button
                    onClick={() => handleAttendanceEvent('clock_out')}
                    disabled={submitting}
                    className="p-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex flex-col items-center gap-1 transition-all active:scale-95 shadow-2xs cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Marcar Salida
                  </button>
                </div>

                <button
                  onClick={() => setStep('meal')}
                  className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all active:scale-95 cursor-pointer ${
                    isDark 
                      ? 'bg-zinc-950 border-zinc-800 hover:border-amber-500/40 text-amber-400' 
                      : 'bg-amber-50/70 border-amber-200 hover:border-amber-300 text-amber-900 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center gap-2 font-sans font-bold">
                    <Utensils className="w-4 h-4" />
                    <span>Registrar mi Colación ($0)</span>
                  </div>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    onSelectStaff(authenticatedStaff);
                    onClose();
                  }}
                  className={`w-full py-2.5 rounded-xl border font-sans font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Continuar como Operador en Salón
                </button>
              </div>
            )}
          </div>
        )}

        {/* Paso 3: Selección Múltiple de Colación (Platos + Bebidas) */}
        {step === 'meal' && authenticatedStaff && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-sans">Elige tus productos de colación:</span>
              <button
                onClick={() => setStep('actions')}
                className="text-[11px] font-mono text-blue-500 hover:underline cursor-pointer"
              >
                ← Volver
              </button>
            </div>

            {/* Lista de productos para agregar */}
            <div className={`rounded-xl border p-2 max-h-48 overflow-y-auto space-y-1.5 ${
              isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-slate-200'
            }`}>
              {products.map((p) => {
                const inCart = mealCart.find((it) => it.product.id === p.id);
                return (
                  <div
                    key={p.id}
                    className={`w-full p-2 rounded-lg text-xs flex items-center justify-between border transition-all ${
                      inCart
                        ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold'
                        : isDark ? 'border-zinc-800/80 hover:bg-zinc-900 text-zinc-300' : 'border-slate-200 hover:bg-white text-slate-700'
                    }`}
                  >
                    <div className="truncate pr-2 min-w-0">
                      <p className="truncate">{p.name}</p>
                      <span className="font-mono text-[10px] text-zinc-500 line-through">
                        ${p.price.toLocaleString('es-CL')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {inCart ? (
                        <>
                          <button
                            type="button"
                            onClick={() => removeFromMealCart(p.id)}
                            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono text-xs font-bold w-4 text-center">
                            {inCart.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => addToMealCart(p)}
                            className="p-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 transition cursor-pointer"
                          >
                            <Plus className="w-3 h-3 stroke-[3]" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToMealCart(p)}
                          className="px-2 py-1 bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 rounded-md text-[10px] font-mono font-bold transition cursor-pointer"
                        >
                          + Agregar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resumen de la colación */}
            <div className={`p-2.5 rounded-xl border text-xs font-mono space-y-1 ${
              isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <div className="flex justify-between text-zinc-500 text-[11px]">
                <span>Valor comercial real:</span>
                <span className="line-through">${realTotalCost.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-dashed border-zinc-800">
                <span className="font-bold">Total a cobrar:</span>
                <span className="font-black text-emerald-500 text-sm">$0 (Beneficio)</span>
              </div>
            </div>

            <button
              onClick={handleConfirmStaffMeal}
              disabled={mealCart.length === 0 || submitting}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              {submitting ? 'Enviando...' : `Confirmar Colación (${mealCart.reduce((a, b) => a + b.quantity, 0)} ítems)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}