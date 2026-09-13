import { useState, useEffect, Component, type ErrorInfo, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import { TablesView } from './components/TablesView';
import { POSOrderModal } from './components/POSOrderModal';
import { CheckoutModal } from './components/CheckoutModal';
import { ShiftClosingModal } from './components/ShiftClosingModal';
import { KitchenView } from './components/KitchenView';
import { InventoryView } from './components/InventoryView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { CashRegisterView } from './components/CashRegisterView';
import { ReceiptModal } from './components/ReceiptModal';
import { StaffPortalModal, type StaffMember } from './components/StaffPortalModal';
import type { RestaurantTable } from './types/database';
import { 
  UtensilsCrossed, Store, PlusCircle, 
  CreditCard, ChefHat, LayoutGrid, Boxes, TrendingUp, Printer,
  User, Sun, Moon, ShieldCheck, Delete, AlertTriangle, DollarSign,
  KeyRound, LogOut, Loader2
} from 'lucide-react';;

// Atrapa-errores para evitar pantallas negras en móviles
interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message || 'Error inesperado' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error capturado en KDS/POS:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center space-y-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300 m-4">
          <AlertTriangle className="w-10 h-10 mx-auto text-rose-400 animate-bounce" />
          <h3 className="font-bold text-sm">Ocurrió un detalle al actualizar la comanda</h3>
          <p className="text-xs font-mono text-zinc-400">{this.state.errorMessage}</p>
          <button
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Continuar Servicio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
const STORE_DEFAULT_PASSWORD = '8068';

// Permisos y vistas permitidas según rol
const ROLE_PERMISSIONS: Record<string, Array<'salon' | 'kitchen' | 'inventory' | 'cash' | 'admin'>> = {
  admin: ['salon', 'kitchen', 'inventory', 'cash', 'admin'],
  cashier: ['cash', 'salon'],
  waiter: ['salon'],
  kitchen: ['kitchen'],
};

// Vista inicial predeterminada por rol
const ROLE_DEFAULT_VIEW: Record<string, 'salon' | 'kitchen' | 'inventory' | 'cash' | 'admin'> = {
  admin: 'admin',
  cashier: 'cash',
  waiter: 'salon',
  kitchen: 'kitchen',
};

export default function App() {
  // 1. Autorización de Terminal del Local
  const [isStoreAuthorized, setIsStoreAuthorized] = useState(() => {
    return localStorage.getItem('pos_store_authorized') === 'true';
  });
  const [storePasswordInput, setStorePasswordInput] = useState('');
  const [storePassError, setStorePassError] = useState(false);

  // 2. Autenticación de Trabajador por PIN
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('pos_authenticated') === 'true';
  });

  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // 3. Colaborador Activo
  const [activeStaff, setActiveStaff] = useState<StaffMember>(() => {
    const savedStaff = localStorage.getItem('pos_active_staff');
    if (savedStaff) {
      try { return JSON.parse(savedStaff); } catch { /* fallback */ }
    }
    return {
      id: 'default',
      name: 'Administrador / Jefe',
      role: 'admin',
      pin_code: '8068',
    };
  });

  const [currentView, setCurrentView] = useState<'salon' | 'kitchen' | 'inventory' | 'cash' | 'admin'>(() => {
    return ROLE_DEFAULT_VIEW[activeStaff.role] || 'salon';
  });

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
  const [isStaffPortalOpen, setIsStaffPortalOpen] = useState(false);

  const isDark = theme === 'dark';

  // Verificar que la vista actual esté permitida para el rol activo
  useEffect(() => {
    const allowed = ROLE_PERMISSIONS[activeStaff.role] || ['salon'];
    if (!allowed.includes(currentView)) {
      setCurrentView(ROLE_DEFAULT_VIEW[activeStaff.role] || allowed[0]);
    }
  }, [activeStaff.role, currentView]);

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

  // Autorización de la contraseña del Local
  const handleAuthorizeStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (storePasswordInput === STORE_DEFAULT_PASSWORD || storePasswordInput === MASTER_PIN) {
      setIsStoreAuthorized(true);
      localStorage.setItem('pos_store_authorized', 'true');
      setStorePassError(false);
      setStorePasswordInput('');
    } else {
      setStorePassError(true);
    }
  };

  // Verificación dinámica de PIN en Supabase
  const processPinVerification = async (pin: string) => {
    setIsVerifyingPin(true);
    setPinError(false);

    try {
      // 1. PIN Maestro de Rescate
      if (pin === MASTER_PIN) {
        const masterAdmin: StaffMember = {
          id: 'master-admin',
          name: 'Administrador Maestro',
          role: 'admin',
          pin_code: MASTER_PIN,
        };
        setActiveStaff(masterAdmin);
        localStorage.setItem('pos_active_staff', JSON.stringify(masterAdmin));
        setIsAuthenticated(true);
        localStorage.setItem('pos_authenticated', 'true');
        setCurrentView('admin');
        setEnteredPin('');
        return;
      }

      // 2. Consulta en la tabla staff de Supabase
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('pin_code', pin)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) {
        setPinError(true);
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(200);
        setTimeout(() => {
          setEnteredPin('');
          setPinError(false);
        }, 800);
        return;
      }

      // Usuario válido: setear sesión y redirigir según su rol
      const staffMember: StaffMember = {
        id: data.id,
        name: data.name,
        role: data.role,
        pin_code: data.pin_code,
      };

      setActiveStaff(staffMember);
      localStorage.setItem('pos_active_staff', JSON.stringify(staffMember));
      setIsAuthenticated(true);
      localStorage.setItem('pos_authenticated', 'true');

      // Redirección inteligente al espacio del rol
      const destinationView = ROLE_DEFAULT_VIEW[staffMember.role] || 'salon';
      setCurrentView(destinationView);
      setEnteredPin('');

    } catch (err) {
      console.error('Error al verificar PIN:', err);
      setPinError(true);
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleNumClick = (num: string) => {
    if (isVerifyingPin || enteredPin.length >= 4) return;
    const nextPin = enteredPin + num;
    setEnteredPin(nextPin);
    setPinError(false);

    if (nextPin.length === 4) {
      processPinVerification(nextPin);
    }
  };

  const handleClearPin = () => {
    if (isVerifyingPin) return;
    setEnteredPin('');
    setPinError(false);
  };

  const handleLock = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('pos_authenticated');
    setEnteredPin('');
    setPinError(false);
  };

  const handleUnlinkTerminal = () => {
    if (confirm('¿Deseas desvincular este dispositivo del local? Se solicitará la contraseña maestra.')) {
      setIsStoreAuthorized(false);
      setIsAuthenticated(false);
      localStorage.removeItem('pos_store_authorized');
      localStorage.removeItem('pos_authenticated');
      setEnteredPin('');
    }
  };

  // PANTALLA 1: Autorización de terminal del Restaurante
  if (!isStoreAuthorized) {
    return (
      <main className="min-h-screen w-full bg-[#0b0f17] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center space-y-5 backdrop-blur-xl">
          <div className="p-4 bg-violet-500/10 rounded-2xl border border-violet-500/20 text-violet-400">
            <Store className="w-8 h-8" />
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-lg font-black tracking-tight">Vincular Terminal POS</h2>
            <p className="text-xs text-slate-400 font-mono">
              Ingresa la contraseña general del restaurante para habilitar este equipo.
            </p>
          </div>

          <form onSubmit={handleAuthorizeStore} className="w-full space-y-3 font-mono">
            <div className="space-y-1">
              <input
                type="password"
                required
                placeholder="Contraseña del Local"
                value={storePasswordInput}
                onChange={(e) => {
                  setStorePasswordInput(e.target.value);
                  setStorePassError(false);
                }}
                className={`w-full p-3 rounded-xl text-center text-sm font-bold bg-slate-950 border outline-none tracking-wider ${
                  storePassError ? 'border-rose-500 bg-rose-500/10 text-rose-300' : 'border-slate-700 text-slate-100 focus:border-violet-500'
                }`}
                autoFocus
              />
              {storePassError && (
                <p className="text-[11px] text-rose-500 text-center font-sans font-bold">
                  Contraseña de local incorrecta.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-violet-600/20 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>Autorizar Dispositivo</span>
            </button>
          </form>

          <span className="text-[10px] font-mono text-slate-500 text-center">
            Contraseña inicial de fábrica: <strong>8068</strong>
          </span>
        </div>
      </main>
    );
  }

  // PANTALLA 2: Teclado táctil de PIN personal del trabajador
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen w-full bg-[#0b0f17] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center space-y-6 backdrop-blur-xl">
          <div className="p-4 bg-sky-500/10 rounded-2xl border border-sky-500/20 text-sky-400">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-lg font-black tracking-tight">Acceso Rápido POS</h2>
            <p className="text-xs text-slate-400 font-mono">
              Digita tu PIN personal de 4 dígitos
            </p>
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

          {pinError ? (
            <span className="text-xs font-mono text-rose-400 font-bold animate-pulse">
              PIN no encontrado o personal inactivo
            </span>
          ) : isVerifyingPin ? (
            <span className="text-xs font-mono text-sky-400 font-bold flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando rol...
            </span>
          ) : (
            <span className="text-[11px] font-mono text-slate-500">
              Ingresa tu código numérico
            </span>
          )}

          <div className="grid grid-cols-3 gap-3 w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                disabled={isVerifyingPin}
                onClick={() => handleNumClick(num)}
                className="h-14 bg-slate-800/80 hover:bg-slate-700 active:bg-sky-600 text-slate-100 font-mono font-bold text-lg rounded-2xl border border-slate-700/60 transition-all active:scale-95 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              disabled={isVerifyingPin}
              onClick={handleClearPin}
              className="h-14 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-slate-400 hover:text-slate-200 font-mono text-sm rounded-2xl border border-slate-700/60 transition-all active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              <Delete className="w-5 h-5" />
            </button>
            <button
              type="button"
              disabled={isVerifyingPin}
              onClick={() => handleNumClick('0')}
              className="h-14 bg-slate-800/80 hover:bg-slate-700 active:bg-sky-600 text-slate-100 font-mono font-bold text-lg rounded-2xl border border-slate-700/60 transition-all active:scale-95 shadow-xs cursor-pointer disabled:opacity-50"
            >
              0
            </button>
            <button
              type="button"
              disabled={isVerifyingPin || enteredPin.length < 4}
              onClick={() => processPinVerification(enteredPin)}
              className="h-14 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs rounded-2xl transition-all active:scale-95 flex items-center justify-center shadow-md shadow-sky-500/20 cursor-pointer"
            >
              Entrar
            </button>
          </div>

          <div className="w-full flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] font-mono">
            <span className="text-slate-500">Terminal Activa</span>
            <button
              type="button"
              onClick={handleUnlinkTerminal}
              className="text-slate-500 hover:text-rose-400 transition cursor-pointer"
            >
              Desvincular
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Lista de vistas permitidas para el usuario conectado
  const allowedViews = ROLE_PERMISSIONS[activeStaff.role] || ['salon'];

  return (
    <main
      className={`min-h-screen w-full flex flex-col items-center p-3 sm:p-6 transition-colors duration-150 ${
        isDark ? 'bg-[#090b10] text-zinc-100' : 'bg-slate-100/90 text-slate-800'
      }`}
    >
      <div className="w-full max-w-7xl space-y-5">
        
        {/* Barra superior con datos del usuario activo y permisos */}
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
                  Operando como: <strong className="capitalize text-blue-500">{activeStaff.name}</strong> ({activeStaff.role})
                </p>
              </div>
            </div>

            {/* Controles móviles */}
            <div className="flex lg:hidden items-center gap-2">
              <button
                onClick={() => setIsStaffPortalOpen(true)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-xl border text-xs font-bold ${
                  isDark ? 'bg-zinc-800 text-zinc-200 border-zinc-700' : 'bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[10px]">Portal</span>
              </button>

              <button
                onClick={handleLock}
                className="p-1.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl"
                title="Cambiar usuario"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Menú de Navegación Dinámico Filtrado por Rol */}
          <div
            className={`flex items-center p-1 rounded-xl border gap-1 overflow-x-auto max-w-full ${
              isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            {allowedViews.includes('salon') && (
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
            )}

            {allowedViews.includes('kitchen') && (
              <button
                onClick={() => setCurrentView('kitchen')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                  currentView === 'kitchen'
                    ? 'bg-amber-500 text-zinc-950 shadow-xs'
                    : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ChefHat className="w-3.5 h-3.5" /> Cocina (KDS)
              </button>
            )}

            {allowedViews.includes('inventory') && (
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
            )}

            {allowedViews.includes('cash') && (
              <button
                onClick={() => setCurrentView('cash')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                  currentView === 'cash'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" /> Caja
              </button>
            )}

            {allowedViews.includes('admin') && (
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
            )}
          </div>

          {/* Acciones de Escritorio */}
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-2 rounded-xl border font-bold text-xs flex items-center transition cursor-pointer ${
                isDark
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-amber-300 border-zinc-700'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs'
              }`}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>

            <button
              onClick={() => setIsStaffPortalOpen(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                isDark
                  ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-700'
                  : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 shadow-xs'
              }`}
              title="Marcar asistencia o colación"
            >
              <User className="w-3.5 h-3.5 text-blue-500" />
              <span>{activeStaff.name}</span>
            </button>

            <button
              onClick={handleLock}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95"
              title="Cerrar turno de usuario y bloquear"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Bloquear</span>
            </button>
          </div>
        </header>

        {/* Contenido Dinámico */}
        <ErrorBoundary>
          {currentView === 'salon' && allowedViews.includes('salon') && (
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

          {currentView === 'kitchen' && allowedViews.includes('kitchen') && (
            <div className={`p-5 rounded-2xl border shadow-xs ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'}`}>
              <KitchenView isDark={isDark} />
            </div>
          )}

          {currentView === 'inventory' && allowedViews.includes('inventory') && (
            <div className={`p-5 rounded-2xl border shadow-xs ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'}`}>
              <InventoryView isDark={isDark} />
            </div>
          )}

          {currentView === 'cash' && allowedViews.includes('cash') && (
            <div className={`p-5 rounded-2xl border shadow-xs ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'}`}>
              <CashRegisterView isDark={isDark} />
            </div>
          )}

          {currentView === 'admin' && allowedViews.includes('admin') && (
            <div className={`p-5 rounded-2xl border shadow-xs ${isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200'}`}>
              <AdminDashboardView isDark={isDark} />
            </div>
          )}
        </ErrorBoundary>
      </div>

      {/* Modales */}
      {isStaffPortalOpen && (
        <StaffPortalModal
          currentStaff={activeStaff}
          onSelectStaff={(staff) => {
            setActiveStaff(staff);
            localStorage.setItem('pos_active_staff', JSON.stringify(staff));
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