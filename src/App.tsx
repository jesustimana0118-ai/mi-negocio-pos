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
import { StaffPortalModal, type StaffMember } from './components/StaffPortalModal';
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
  waiter_name?: string;
}

const CURRENT_SHIFT_ID = '11111111-2222-3333-4444-555555555555';
const MASTER_PIN = '8068';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const [currentView, setCurrentView] = useState<'salon' | 'kitchen' | 'inventory' | 'admin'>('salon');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [selectedTakeout, setSelectedTakeout] = useState<ActiveOrderSummary | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrderSummary | null>(null);

  const [isOrdering, setIsOrdering] = useState(false);
  const [isTakeoutOrdering, setIsTakeoutOrdering] = useState(false);
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
  const [isStaffPortalOpen, setIsStaffPortalOpen] = useState(false);

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
        if (!selectedTakeout) setActiveOrder(null);
        return;
      }

      const { data } = await supabase
        .from('orders')
        .select('id, order_number, subtotal_net, iva_amount, tip_amount, total_amount, waiter_name')
        .eq('table_id', selectedTable.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveOrder(data as ActiveOrderSummary | null);
    }

    if (selectedTable) {
      loadTableOrder();
    }
  }, [selectedTable, refreshKey]);

  const handleTableClick = (table: RestaurantTable) => {
    setSelectedTakeout(null);
    setSelectedTable(table);
    if (table.status === 'available') {
      setIsOrdering(true);
    }
  };

  const handleSelectTakeoutOrder = (order: ActiveOrderSummary) => {
    setSelectedTable(null);
    setSelectedTakeout(order);
    setActiveOrder(order);
  };

  const handleOrderSuccess = () => {
    setIsOrdering(false);
    setIsTakeoutOrdering(false);
    setSelectedTable(null);
    setSelectedTakeout(null);
    setRefreshKey((k) => k + 1);
  };

  const handlePaymentSuccess = () => {
    setIsPaying(false);
    setSelectedTable(null);
    setSelectedTakeout(null);
    setActiveOrder(null);
    setRefreshKey((k) => k + 1);
  };

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

          <div className="grid grid-cols-3 gap-3 w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleNumClick(num)}
                className="h-14 bg-slate-800/80 hover:bg-slate-700 active:bg-sky-600 text-slate-100 font-mono font-bold text-lg rounded-2xl border border-slate-700/60 transition-all active:scale-95 shadow-xs cursor-pointer"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClearPin}
              className="h-14 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-slate-400 hover:text-slate-200 font-mono text-sm rounded-2xl border border-slate-700/60 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
            >
              <Delete className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => handleNumClick('0')}
              className="h-14 bg-slate-800/80 hover:bg-slate-700 active:bg-sky-600 text-slate-100 font-mono font-bold text-lg rounded-2xl border border-slate-700/60 transition-all active:scale-95 shadow-xs cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => {
                if (enteredPin === MASTER_PIN) setIsAuthenticated(true);
                else {
                  setPinError(true);
                  setTimeout(() => { setEnteredPin(''); setPinError(false); }, 800);
                }
              }}
              className="h-14 bg-sky-500 hover:bg-sky-400 text-slate-950 font-mono font-bold text-xs rounded-2xl transition-all active:scale-95 flex items-center justify-center shadow-md shadow-sky-500/20 cursor-pointer"
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

  return (
    <main
      className={`min-h-screen w-full flex flex-col items-center p-3 sm:p-6 transition-colors duration-150 ${
        isDark ? 'bg-[#090b10] text-zinc-100' : 'bg-slate-100/90 text-slate-800'
      }`}
    >
      <div className="w-full max-w-7xl space-y-5">
        
        {/* Barra superior */}
        <header
          className={`flex flex-col lg:flex-row items-center justify-between p-3.5 sm:px-6 rounded-2xl border transition-all gap-4 ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-800 shadow-xl'
              : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-start shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h1 className={`text-sm font-black tracking-tight flex items-center gap-1.5 ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                  Mi Negocio POS
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </h1>
                <p className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500 font-medium'}`}>
                  Salón, KDS, Bodega & Gerencia
                </p>
              </div>
            </div>

            <div className="flex lg:hidden items-center gap-2">
              <button
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className={`p-2 rounded-xl border cursor-pointer ${
                  isDark ? 'bg-zinc-800 border-zinc-700 text-amber-400' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsAuthenticated(false)}
                className="px-2.5 py-1.5 bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded-xl text-xs font-bold cursor-pointer"
              >
                Bloquear
              </button>
            </div>
          </div>

          <div
            className={`flex items-center p-1 rounded-xl border gap-1 overflow-x-auto max-w-full ${
              isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              onClick={() => setCurrentView('salon')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                currentView === 'salon'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Salón
            </button>
            <button
              onClick={() => setCurrentView('kitchen')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                currentView === 'kitchen'
                  ? 'bg-amber-500 text-zinc-950 shadow-xs'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5" /> Cocina
            </button>
            <button
              onClick={() => setCurrentView('inventory')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                currentView === 'inventory'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" /> Bodega
            </button>
            <button
              onClick={() => setCurrentView('admin')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                currentView === 'admin'
                  ? 'bg-violet-600 text-white shadow-xs'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Gerencia
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`px-3 py-2 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all active:scale-95 cursor-pointer ${
                isDark
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-amber-300 border-zinc-700'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs'
              }`}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
              <span>{isDark ? 'Claro' : 'Oscuro'}</span>
            </button>

            <div className={`w-px h-6 ${isDark ? 'bg-zinc-800' : 'bg-slate-200'}`} />

            {/* Acceso al Portal de Personal (Asistencia y Colación) */}
            <button
              onClick={() => setIsStaffPortalOpen(true)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                isDark
                  ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-700'
                  : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 shadow-xs'
              }`}
              title="Portal de Personal • Marcar asistencia o colación"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>{activeStaff.name}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-slate-100 border-slate-300 text-slate-700 font-semibold'
              }`}>
                PORTAL
              </span>
            </button>

            <button
              onClick={() => setIsClosingShift(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-400 border border-amber-500/30 rounded-xl transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              <Lock className="w-3.5 h-3.5" /> Cierre
            </button>

            <button
              onClick={() => setIsAuthenticated(false)}
              className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
              title="Bloquear sistema"
            >
              Bloquear
            </button>
          </div>
        </header>

        {/* Vista Salón */}
        {currentView === 'salon' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <div
              className={`lg:col-span-2 p-5 rounded-2xl border transition-colors shadow-xs ${
                isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              <TablesView
                key={refreshKey}
                isDark={isDark}
                onSelectTable={(table) => handleTableClick(table)}
                onNewTakeoutOrder={() => setIsTakeoutOrdering(true)}
                onSelectTakeoutOrder={(order) => handleSelectTakeoutOrder(order)}
              />
            </div>

            {/* Panel Lateral */}
            <div
              className={`lg:col-span-1 p-5 rounded-2xl border transition-colors shadow-xs flex flex-col justify-between min-h-[440px] sticky top-4 ${
                isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              {selectedTable || selectedTakeout ? (
                <div className="space-y-4">
                  <div className={`border-b pb-3 ${isDark ? 'border-zinc-800' : 'border-slate-100'}`}>
                    <span className={`text-[10px] font-mono uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border ${
                      selectedTable
                        ? isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-blue-50 border-blue-200 text-blue-700'
                        : isDark ? 'bg-violet-950/60 border-violet-700 text-violet-300' : 'bg-violet-50 border-violet-200 text-violet-700'
                    }`}>
                      {selectedTable ? 'Mesa Seleccionada' : 'Pedido Para Llevar'}
                    </span>
                    <h3 className={`text-xl font-black mt-1.5 truncate ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                      {selectedTable ? selectedTable.name : (selectedTakeout?.waiter_name?.replace('Para Llevar • ', '') || 'Para Llevar')}
                    </h3>
                    <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-600 font-medium'}`}>
                      {selectedTable ? `Capacidad: ${selectedTable.capacity} personas` : 'Retiro en mostrador'}
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-xl border space-y-2.5 transition-colors ${
                      isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between text-xs items-center">
                      <span className={`font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>Estado:</span>
                      <span
                        className={`font-mono text-xs font-bold capitalize px-2.5 py-0.5 rounded-full border shadow-2xs ${
                          selectedTable
                            ? selectedTable.status === 'occupied'
                              ? 'text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/20'
                              : 'text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/20'
                            : 'text-violet-800 dark:text-violet-300 bg-violet-100 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/20'
                        }`}
                      >
                        {selectedTable ? (selectedTable.status === 'occupied' ? 'Ocupada' : 'Disponible') : 'Por Entregar'}
                      </span>
                    </div>

                    {activeOrder && (
                      <div
                        className={`space-y-1.5 pt-2 border-t font-mono text-xs ${
                          isDark ? 'border-zinc-800 text-zinc-300' : 'border-slate-200/80 text-slate-700'
                        }`}
                      >
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>Comanda:</span>
                          <span className={`font-bold ${isDark ? 'text-zinc-200' : 'text-slate-900'}`}>
                            #{activeOrder.order_number}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>Consumo Neto:</span>
                          <span className={isDark ? 'text-zinc-300' : 'text-slate-800 font-semibold'}>
                            ${activeOrder.subtotal_net.toLocaleString('es-CL')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>IVA (19%):</span>
                          <span className={isDark ? 'text-zinc-300' : 'text-slate-800 font-semibold'}>
                            ${activeOrder.iva_amount.toLocaleString('es-CL')}
                          </span>
                        </div>
                        <div className={`flex justify-between font-bold ${
                          isDark ? 'text-amber-400' : 'text-amber-800'
                        }`}>
                          <span>Propina:</span>
                          <span>${activeOrder.tip_amount.toLocaleString('es-CL')}</span>
                        </div>
                        <div
                          className={`flex justify-between text-base font-black pt-2 border-t ${
                            isDark ? 'border-zinc-800 text-zinc-100' : 'border-slate-200 text-slate-900'
                          }`}
                        >
                          <span>Total:</span>
                          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                            ${activeOrder.total_amount.toLocaleString('es-CL')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {activeOrder ? (
                    <div className="space-y-2 pt-1">
                      <button
                        onClick={() => setIsPaying(true)}
                        className={`w-full py-3 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md cursor-pointer ${
                          selectedTakeout 
                            ? 'bg-violet-600 hover:bg-violet-500 shadow-violet-600/20' 
                            : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
                        }`}
                      >
                        <CreditCard className="w-4 h-4" /> Cobrar (${activeOrder.total_amount.toLocaleString('es-CL')})
                      </button>

                      <button
                        onClick={() => setPrintingOrder({ id: activeOrder.id, isPrecuenta: true })}
                        className={`w-full py-2.5 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border transition-all active:scale-95 cursor-pointer ${
                          isDark
                            ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs'
                        }`}
                      >
                        <Printer className="w-4 h-4 text-slate-500" /> Imprimir Comanda / Ticket
                      </button>
                    </div>
                  ) : (
                    selectedTable && (
                      <button
                        onClick={() => setIsOrdering(true)}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-blue-600/20 cursor-pointer"
                      >
                        <PlusCircle className="w-4 h-4" /> Tomar Pedido ({activeStaff.name.split(' ')[0]})
                      </button>
                    )
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                  <div
                    className={`p-4 rounded-2xl border transition-colors ${
                      isDark ? 'bg-zinc-800/50 border-zinc-700 text-zinc-500' : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    <UtensilsCrossed className="w-7 h-7" />
                  </div>
                  <p className={`text-xs max-w-[200px] font-medium ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                    Toca una mesa o un pedido para llevar para operar.
                  </p>
                </div>
              )}

              <div className={`pt-4 border-t ${isDark ? 'border-zinc-800' : 'border-slate-100'}`}>
                <span className={`text-[10px] font-mono block text-center ${isDark ? 'text-zinc-500' : 'text-slate-400 font-medium'}`}>
                  Terminal Táctil • Mi Negocio POS
                </span>
              </div>
            </div>
          </div>
        )}

        {currentView === 'kitchen' && (
          <div className={`p-5 rounded-2xl border shadow-xs ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'}`}>
            <KitchenView isDark={isDark} />
          </div>
        )}

        {currentView === 'inventory' && (
          <div className={`p-5 rounded-2xl border shadow-xs ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'}`}>
            <InventoryView isDark={isDark} />
          </div>
        )}

        {currentView === 'admin' && (
          <div className={`p-5 rounded-2xl border shadow-xs ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'}`}>
            <AdminDashboardView isDark={isDark} />
          </div>
        )}
      </div>

      {/* Modal Portal de Personal (Asistencia y Colaciones) */}
      {isStaffPortalOpen && (
        <StaffPortalModal
          currentStaff={activeStaff}
          onSelectStaff={(staff) => {
            setActiveStaff(staff);
            setIsStaffPortalOpen(false);
          }}
          onClose={() => setIsStaffPortalOpen(false)}
          isDark={isDark}
        />
      )}

      {isOrdering && selectedTable && (
        <POSOrderModal
          table={selectedTable}
          isTakeout={false}
          waiterName={activeStaff.name}
          onClose={() => setIsOrdering(false)}
          onOrderSuccess={handleOrderSuccess}
        />
      )}

      {isTakeoutOrdering && (
        <POSOrderModal
          table={null}
          isTakeout={true}
          waiterName={activeStaff.name}
          onClose={() => setIsTakeoutOrdering(false)}
          onOrderSuccess={handleOrderSuccess}
        />
      )}

      {isPaying && activeOrder && (
        <CheckoutModal
          table={selectedTable}
          order={activeOrder}
          isDark={isDark}
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

      {printingOrder && (
        <ReceiptModal
          orderId={printingOrder.id}
          tableName={selectedTable ? selectedTable.name : (selectedTakeout?.waiter_name?.replace('Para Llevar • ', '') || 'Para Llevar')}
          tableNumber={selectedTable ? selectedTable.table_number : 0}
          isPrecuenta={printingOrder.isPrecuenta}
          onClose={() => setPrintingOrder(null)}
        />
      )}
    </main>
  );
}