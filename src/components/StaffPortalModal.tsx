import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Product } from '../types/database';
import { 
  X, UserCheck, Clock, Utensils, LogOut, 
  CheckCircle2, ArrowRight, Delete, Plus, Minus, ShoppingBag, Sparkles
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
  isDark = false 
}: StaffPortalModalProps) {
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [authenticatedStaff, setAuthenticatedStaff] = useState<StaffMember | null>(null);
  
  const [step, setStep] = useState<'pin' | 'actions' | 'meal'>('pin');
  
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

  const totalItemCount = mealCart.reduce((acc, it) => acc + it.quantity, 0);

  const handleConfirmStaffMeal = async () => {
    if (!authenticatedStaff || mealCart.length === 0 || submitting) return;
    setSubmitting(true);

    try {
      const { data: openShift } = await supabase
        .from('cash_shifts')
        .select('id')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

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

      setSuccessMessage(`Colación autorizada (${totalItemCount} productos)`);
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
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className={`w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 border transition-all ${
        isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        
        {/* Cabecera unificada */}
        <div className={`flex items-center justify-between border-b pb-3.5 ${
          isDark ? 'border-zinc-800' : 'border-slate-100'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl border ${
              isDark ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-blue-50 text-blue-600 border-blue-200'
            }`}>
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm tracking-tight">Portal de Personal</h3>
              <p className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Asistencia, colaciones y turnos
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className={`p-1.5 rounded-xl transition cursor-pointer ${
              isDark ? 'text-zinc-400 hover:text-zinc-100 bg-zinc-800/60' : 'text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Paso 1: PIN de 4 dígitos */}
        {step === 'pin' && (
          <div className="flex flex-col items-center space-y-4 py-2">
            <div className="text-center space-y-1">
              <p className={`text-xs font-semibold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                Digita tu PIN personal
              </p>
              {currentStaff && (
                <span className={`inline-block text-[11px] font-mono px-2 py-0.5 rounded-md border ${
                  isDark ? 'bg-zinc-800/80 border-zinc-700 text-zinc-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}>
                  Sesión activa: <strong className={isDark ? 'text-zinc-200' : 'text-slate-900'}>{currentStaff.name}</strong>
                </span>
              )}
            </div>

            <div className="flex gap-3 my-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                    pinError
                      ? 'bg-rose-500 animate-shake'
                      : pin.length > i
                      ? 'bg-blue-600 shadow-sm shadow-blue-500/50 scale-110'
                      : isDark ? 'bg-zinc-800 border border-zinc-700' : 'bg-slate-200 border border-slate-300'
                  }`}
                />
              ))}
            </div>

            {pinError && (
              <span className="text-xs font-mono text-rose-500 font-bold">PIN incorrecto</span>
            )}

            <div className="grid grid-cols-3 gap-2.5 w-full pt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                <button
                  key={n}
                  onClick={() => handleNumClick(n)}
                  className={`h-12 rounded-2xl font-mono font-bold text-base border transition-all active:scale-95 cursor-pointer ${
                    isDark 
                      ? 'bg-zinc-950/80 border-zinc-800 text-zinc-100 hover:bg-zinc-800' 
                      : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 shadow-xs'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPin('')}
                className={`h-12 rounded-2xl border flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  isDark ? 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-zinc-200' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <Delete className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleNumClick('0')}
                className={`h-12 rounded-2xl font-mono font-bold text-base border transition-all active:scale-95 cursor-pointer ${
                  isDark 
                    ? 'bg-zinc-950/80 border-zinc-800 text-zinc-100 hover:bg-zinc-800' 
                    : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 shadow-xs'
                }`}
              >
                0
              </button>
              <div className="h-12" />
            </div>
          </div>
        )}

        {/* Paso 2: Menú de acciones */}
        {step === 'actions' && authenticatedStaff && (
          <div className="space-y-4 py-1">
            <div className={`p-4 rounded-2xl border text-center space-y-0.5 ${
              isDark ? 'bg-zinc-950/90 border-zinc-800' : 'bg-slate-50 border-slate-200 shadow-2xs'
            }`}>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Empleado Verificado
              </span>
              <h4 className="text-base font-black text-slate-900 dark:text-zinc-100 pt-1">
                {authenticatedStaff.name}
              </h4>
              <p className={`text-xs capitalize font-medium ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Cargo: {authenticatedStaff.role}
              </p>
            </div>

            {successMessage ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{successMessage}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => handleAttendanceEvent('clock_in')}
                    disabled={submitting}
                    className="p-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex flex-col items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
                  >
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-sans">Marcar Entrada</span>
                  </button>

                  <button
                    onClick={() => handleAttendanceEvent('clock_out')}
                    disabled={submitting}
                    className="p-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex flex-col items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-xs font-sans">Marcar Salida</span>
                  </button>
                </div>

                <button
                  onClick={() => setStep('meal')}
                  className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all active:scale-[0.98] cursor-pointer ${
                    isDark 
                      ? 'bg-zinc-950 border-zinc-800 hover:border-emerald-500/40 text-emerald-400' 
                      : 'bg-emerald-50/70 border-emerald-200 hover:border-emerald-300 text-emerald-900 shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-xl border ${
                      isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-100 border-emerald-200 text-emerald-700'
                    }`}>
                      <Utensils className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold leading-tight">Registrar mi Colación</p>
                      <p className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-emerald-700'}`}>
                        Consumo a costo $0 para el personal
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 opacity-70" />
                </button>

                <button
                  onClick={() => {
                    onSelectStaff(authenticatedStaff);
                    onClose();
                  }}
                  className={`w-full py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Continuar como Operador en Salón
                </button>
              </div>
            )}
          </div>
        )}

        {/* Paso 3: Selección multielemento de colación */}
        {step === 'meal' && authenticatedStaff && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                  Selección de Alimentos
                </h4>
                <p className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Elige plato de fondo y bebestible
                </p>
              </div>
              <button
                onClick={() => setStep('actions')}
                className="text-xs font-mono font-bold text-blue-600 hover:text-blue-500 cursor-pointer"
              >
                ← Volver
              </button>
            </div>

            {/* Listado de ítems disponibles */}
            <div className={`rounded-2xl border p-2 max-h-56 overflow-y-auto space-y-1.5 ${
              isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-slate-50 border-slate-200'
            }`}>
              {products.map((p) => {
                const inCart = mealCart.find((it) => it.product.id === p.id);
                const quantity = inCart?.quantity || 0;

                return (
                  <div
                    key={p.id}
                    className={`p-2.5 rounded-xl border transition-all flex items-center justify-between ${
                      quantity > 0
                        ? isDark
                          ? 'bg-emerald-500/[0.08] border-emerald-500/40'
                          : 'bg-emerald-50/80 border-emerald-300 shadow-2xs'
                        : isDark
                        ? 'bg-zinc-900 border-zinc-800'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className={`text-xs font-bold truncate ${
                        quantity > 0 
                          ? isDark ? 'text-emerald-300' : 'text-emerald-950'
                          : isDark ? 'text-zinc-200' : 'text-slate-800'
                      }`}>
                        {p.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[10px] text-slate-400 line-through">
                          ${p.price.toLocaleString('es-CL')}
                        </span>
                        <span className={`text-[9px] font-mono font-black uppercase px-1 py-0.2 rounded border ${
                          isDark 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}>
                          Beneficio $0
                        </span>
                      </div>
                    </div>

                    {/* Controles de adición / sustracción */}
                    <div className="shrink-0">
                      {quantity > 0 ? (
                        <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${
                          isDark ? 'bg-zinc-900 border-emerald-500/30' : 'bg-white border-emerald-300'
                        }`}>
                          <button
                            type="button"
                            onClick={() => removeFromMealCart(p.id)}
                            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono text-xs font-black w-5 text-center text-emerald-600 dark:text-emerald-400">
                            {quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => addToMealCart(p)}
                            className="p-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                          >
                            <Plus className="w-3 h-3 stroke-[3]" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToMealCart(p)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 cursor-pointer flex items-center gap-1 ${
                            isDark
                              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Añadir</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resumen Contable */}
            <div className={`p-3 rounded-2xl border space-y-2 ${
              isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-slate-200 shadow-2xs'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                <span>Costo real de ingredientes:</span>
                <span className="line-through">${realTotalCost.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 dark:border-zinc-800">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-black text-slate-800 dark:text-zinc-200">
                    A descontar al personal:
                  </span>
                </div>
                <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                  $0 CLP
                </span>
              </div>
            </div>

            {/* Confirmación final */}
            <button
              onClick={handleConfirmStaffMeal}
              disabled={totalItemCount === 0 || submitting}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-extrabold rounded-2xl text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              {submitting ? 'Registrando comanda...' : `Confirmar Colación (${totalItemCount} productos)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}