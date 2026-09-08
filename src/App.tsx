import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { TablesView } from './components/TablesView';
import { POSOrderModal } from './components/POSOrderModal';
import { CheckoutModal } from './components/CheckoutModal';
import { ShiftClosingModal } from './components/ShiftClosingModal';
import { KitchenView } from './components/KitchenView';
import { InventoryView } from './components/InventoryView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { ReceiptModal } from './components/ReceiptModal';
import { PinModal, type StaffMember } from './components/PinModal';
import type { RestaurantTable } from './types/database';
import { 
  UtensilsCrossed, Store, PlusCircle, 
  CreditCard, Lock, ChefHat, LayoutGrid, Boxes, TrendingUp, Printer,
  User, Sun, Moon, ShieldCheck, Delete
} from 'lucide-react';

interface ActiveOrderSummary {
  id: string;
  order_number: number;
  subtotal_net: number;
  iva_amount: number;
  tip_amount: number;
  total_amount: number;
}

const CURRENT_SHIFT_ID = '11111111-2222-3333-4444-555555555555';
const MASTER_PIN = '8068';

export default function App() {
  // Estado de Autenticación General con PIN Maestro
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const [currentView, setCurrentView] = useState<'salon' | 'kitchen' | 'inventory' | 'admin'>('salon');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrderSummary | null>(null);
  const [isOrdering, setIsOrdering] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isClosingShift, setIsClosingShift] = useState(false);
  const [printingOrder, setPrintingOrder] = useState<{ id: string; isPrecuenta: boolean } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [activeStaff, setActiveStaff] = useState<StaffMember>({
    id: 'default',
    name: 'Carlos Muñoz',
    role: 'waiter',
    pin_code: '1234',
  });
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const isDark = theme === 'dark';

  useEffect(() => {
    async function loadDefaultStaff() {
      const { data } = await supabase
        .from('staff')
        .select('id, name, role, pin_code')
        .eq('pin_code', '1234')
        .maybeSingle();

      if (data) {
        setActiveStaff(data as StaffMember);
      }
    }
    loadDefaultStaff();
  }, []);

  useEffect(() => {
    async function loadTableOrder() {
      if (!selectedTable || selectedTable.status !== 'occupied') {
        setActiveOrder(null);
        return;
      }

      const { data } = await supabase
        .from('orders')
        .select('id, order_number, subtotal_net, iva_amount, tip_amount, total_amount')
        .eq('table_id', selectedTable.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveOrder(data as ActiveOrderSummary | null);
    }

    loadTableOrder();
  }, [selectedTable, refreshKey]);

  const handleTableClick = (table: RestaurantTable) => {
    setSelectedTable(table);
    if (table.status === 'available') {
      setIsOrdering(true);
    }
  };

  const handleOrderSuccess = () => {
    setIsOrdering(false);
    setSelectedTable(null);
    setRefreshKey((k) => k + 1);
  };

  const handlePaymentSuccess = () => {
    setIsPaying(false);
    setSelectedTable(null);
    setActiveOrder(null);
    setRefreshKey((k) => k + 1);
  };

  // Manejo del teclado numérico para el PIN Maestro 8068
  const handleNumClick = (num: string) => {
    if (enteredPin.length < 4) {
      const nextPin = enteredPin + num;
      setEnteredPin(nextPin);
      setPinError(false);

      if (nextPin.length === 4) {
        if (nextPin === MASTER_PIN) {
          setIsAuthenticated(true);
        } else {
          setPinError(true);
          setTimeout(() => {
            setEnteredPin('');
            setPinError(false);
          }, 800);
        }
      }
    }
  };

  const handleClearPin = () => {
    setEnteredPin('');
    setPinError(false);
  };

  // Si no está autenticado, mostrar pantalla de bloqueo PIN
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen w-full bg-[#0b0f17] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center space-y-6 backdrop-blur-xl">
          <div className="p-4 bg-sky-500/10 rounded-2xl border border-sky-500/20 text-sky-400">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-lg font-black tracking-tight">Acceso Protegido</h2>
            <p className="text-xs text-slate-400 font-mono">Ingresa el PIN maestro para desbloquear</p>
          </div>

          {/* Círculos indicadores del PIN */}
          <div className="flex gap-3 my-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-all ${
                  pinError
                    ? 'bg-rose-500 animate-shake'
                    : enteredPin.length > i
                    ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.5)]'
                    : 'bg-slate-800 border border-slate-700'
                }`}
              />
            ))}
          </div>

          {pinError && (
            <span className="text-xs font-mono text-rose-400 font-bold animate-pulse">PIN Incorrecto</span>
          )}

          {/* Teclado Numérico */}
          <div className="grid grid-cols-3 gap-3 w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                onClick={() => handleNumClick(num)}
                className="h-14 bg-slate-800/80 hover:bg-slate-700 active:bg-sky-600 text-slate-100 font-mono font-bold text-lg rounded-2xl border border-slate-700/60 transition active:scale-95 shadow-sm"
              >
                {num}
              </button>
            ))}
            <button
              onClick={handleClearPin}
              className="h-14 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-slate-400 hover:text-slate-200 font-mono text-sm rounded-2xl border border-slate-700/60 transition active:scale-95 flex items-center justify-center"
            >
              <Delete className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleNumClick('0')}
              className="h-14 bg-slate-800/80 hover:bg-slate-700 active:bg-sky-600 text-slate-100 font-mono font-bold text-lg rounded-2xl border border-slate-700/60 transition active:scale-95 shadow-sm"
            >
              0
            </button>
            <button
              onClick={() => {
                if (enteredPin === MASTER_PIN) setIsAuthenticated(true);
                else {
                  setPinError(true);
                  setTimeout(() => { setEnteredPin(''); setPinError(false); }, 800);
                }
              }}
              className="h-14 bg-sky-500 hover:bg-sky-400 text-slate-950 font-mono font-bold text-xs rounded-2xl transition active:scale-95 flex items-center justify-center shadow-md shadow-sky-500/20"
            >
              Entrar
            </button>
          </div>

          <span className="text-[10px] font-mono text-slate-500">
            Terminal POS Protegido • Supabase Cloud
          </span>
        </div>
      </main>
    );
  }

  // Interfaz Completa al estar Autenticado
  return (
    <main
      className={`min-h-screen w-full flex flex-col items-center p-3 sm:p-6 transition-colors duration-150 ${
        isDark ? 'bg-[#090b10] text-zinc-100' : 'bg-slate-100 text-slate-800'
      }`}
    >
      <div className="w-full max-w-7xl space-y-5">
        
        {/* Barra superior con espacios limpios y separados */}
        <header
          className={`flex flex-col lg:flex-row items-center justify-between p-3.5 sm:px-6 rounded-2xl border transition-all gap-4 ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-800 shadow-xl'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          {/* Marca / Logo */}
          <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-start shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-tight flex items-center gap-1.5">
                  Mi Negocio POS
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                </h1>
                <p className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Salón, KDS, Bodega & Gerencia
                </p>
              </div>
            </div>

            {/* Móvil: Tema y Bloqueo */}
            <div className="flex lg:hidden items-center gap-2">
              <button
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className={`p-2 rounded-xl border ${
                  isDark ? 'bg-zinc-800 border-zinc-700 text-amber-400' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsAuthenticated(false)}
                className="px-2.5 py-1.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl text-xs font-bold"
                title="Bloquear sistema"
              >
                Bloquear
              </button>
            </div>
          </div>

          {/* Menú de Módulos (Centro) */}
          <div
            className={`flex items-center p-1 rounded-xl border gap-1 overflow-x-auto max-w-full ${
              isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              onClick={() => setCurrentView('salon')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition shrink-0 ${
                currentView === 'salon'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Salón
            </button>
            <button
              onClick={() => setCurrentView('kitchen')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition shrink-0 ${
                currentView === 'kitchen'
                  ? 'bg-amber-500 text-zinc-950 shadow-sm'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5" /> Cocina
            </button>
            <button
              onClick={() => setCurrentView('inventory')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition shrink-0 ${
                currentView === 'inventory'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" /> Bodega
            </button>
            <button
              onClick={() => setCurrentView('admin')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition shrink-0 ${
                currentView === 'admin'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Gerencia
            </button>
          </div>

          {/* Bloque Derecho */}
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`px-3 py-2 rounded-xl border font-bold text-xs flex items-center gap-2 transition active:scale-95 ${
                isDark
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-amber-300 border-zinc-700'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs'
              }`}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
              <span>{isDark ? 'Claro' : 'Oscuro'}</span>
            </button>

            <div className={`w-px h-6 ${isDark ? 'bg-zinc-800' : 'bg-slate-200'}`} />

            <button
              onClick={() => setIsPinModalOpen(true)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition active:scale-95 ${
                isDark
                  ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-700'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 shadow-xs'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>{activeStaff.name}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-slate-300 text-slate-600'
              }`}>
                PIN
              </span>
            </button>

            <button
              onClick={() => setIsClosingShift(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-xl transition active:scale-95"
            >
              <Lock className="w-3.5 h-3.5" /> Cierre
            </button>

            {/* Botón para Bloquear sesión */}
            <button
              onClick={() => setIsAuthenticated(false)}
              className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/30 rounded-xl text-xs font-bold transition active:scale-95"
              title="Bloquear sistema"
            >
              Bloquear
            </button>
          </div>
        </header>

        {/* Vista del Salón */}
        {currentView === 'salon' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <div
              className={`lg:col-span-2 p-5 rounded-2xl border transition-colors shadow-sm ${
                isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              <TablesView
                key={refreshKey}
                isDark={isDark}
                onSelectTable={(table) => handleTableClick(table)}
              />
            </div>

            {/* Panel Lateral */}
            <div
              className={`lg:col-span-1 p-5 rounded-2xl border transition-colors shadow-sm flex flex-col justify-between min-h-[440px] sticky top-4 ${
                isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              {selectedTable ? (
                <div className="space-y-4">
                  <div className={`border-b pb-3 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-zinc-700">
                      Mesa Seleccionada
                    </span>
                    <h3 className="text-xl font-black mt-1.5">{selectedTable.name}</h3>
                    <p className={`text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Capacidad: {selectedTable.capacity} personas
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-xl border space-y-2.5 ${
                      isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between text-xs items-center">
                      <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>Estado:</span>
                      <span
                        className={`font-mono text-xs font-bold capitalize px-2.5 py-0.5 rounded-full border ${
                          selectedTable.status === 'occupied'
                            ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
                            : 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
                        }`}
                      >
                        {selectedTable.status === 'occupied' ? 'Ocupada' : 'Disponible'}
                      </span>
                    </div>

                    {activeOrder && (
                      <div
                        className={`space-y-1.5 pt-2 border-t font-mono text-xs ${
                          isDark ? 'border-zinc-800 text-zinc-300' : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>Comanda:</span>
                          <span className="font-bold">#{activeOrder.order_number}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>Consumo Neto:</span>
                          <span>${activeOrder.subtotal_net.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>IVA (19%):</span>
                          <span>${activeOrder.iva_amount.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="flex justify-between text-amber-700 dark:text-amber-400 font-bold">
                          <span>Propina (10%):</span>
                          <span>${activeOrder.tip_amount.toLocaleString('es-CL')}</span>
                        </div>
                        <div
                          className={`flex justify-between text-base font-black pt-2 border-t ${
                            isDark ? 'border-zinc-800 text-zinc-100' : 'border-slate-200 text-slate-900'
                          }`}
                        >
                          <span>Total:</span>
                          <span className="tabular-nums">${activeOrder.total_amount.toLocaleString('es-CL')}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedTable.status === 'occupied' && activeOrder ? (
                    <div className="space-y-2 pt-1">
                      <button
                        onClick={() => setIsPaying(true)}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-blue-600/20"
                      >
                        <CreditCard className="w-4 h-4" /> Cobrar (${activeOrder.total_amount.toLocaleString('es-CL')})
                      </button>

                      <button
                        onClick={() => setPrintingOrder({ id: activeOrder.id, isPrecuenta: true })}
                        className={`w-full py-2.5 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border transition active:scale-95 ${
                          isDark
                            ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        <Printer className="w-4 h-4 text-slate-500" /> Imprimir Precuenta
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsOrdering(true)}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-blue-600/20"
                    >
                      <PlusCircle className="w-4 h-4" /> Tomar Pedido ({activeStaff.name.split(' ')[0]})
                    </button>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                  <div
                    className={`p-4 rounded-2xl border ${
                      isDark ? 'bg-zinc-800/50 border-zinc-700 text-zinc-500' : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    <UtensilsCrossed className="w-7 h-7" />
                  </div>
                  <p className={`text-xs max-w-[190px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Toca cualquier mesa del plano para abrir su comanda o cobrar.
                  </p>
                </div>
              )}

              <div className={`pt-4 border-t ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
                <span className={`text-[10px] font-mono block text-center ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                  Terminal Táctil • Mi Negocio POS
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Demás Vistas */}
        {currentView === 'kitchen' && (
          <div className={`p-5 rounded-2xl border shadow-sm ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'}`}>
            <KitchenView isDark={isDark} />
          </div>
        )}

        {currentView === 'inventory' && (
          <div className={`p-5 rounded-2xl border shadow-sm ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'}`}>
            <InventoryView isDark={isDark} />
          </div>
        )}

        {currentView === 'admin' && (
          <div className={`p-5 rounded-2xl border shadow-sm ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'}`}>
            <AdminDashboardView isDark={isDark} />
          </div>
        )}
      </div>

      {/* Modales */}
      {isPinModalOpen && (
        <PinModal
          onSuccess={(staff) => {
            setActiveStaff(staff);
            setIsPinModalOpen(false);
          }}
          onClose={() => setIsPinModalOpen(false)}
        />
      )}

      {isOrdering && selectedTable && (
        <POSOrderModal
          table={selectedTable}
          waiterName={activeStaff.name}
          onClose={() => setIsOrdering(false)}
          onOrderSuccess={handleOrderSuccess}
        />
      )}

      {isPaying && selectedTable && activeOrder && (
        <CheckoutModal
          table={selectedTable}
          order={activeOrder}
          onClose={() => setIsPaying(false)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {isClosingShift && (
        <ShiftClosingModal
          shiftId={CURRENT_SHIFT_ID}
          onClose={() => setIsClosingShift(false)}
          onShiftClosed={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {printingOrder && selectedTable && (
        <ReceiptModal
          orderId={printingOrder.id}
          tableName={selectedTable.name}
          tableNumber={selectedTable.table_number}
          isPrecuenta={printingOrder.isPrecuenta}
          onClose={() => setPrintingOrder(null)}
        />
      )}
    </main>
  );
}