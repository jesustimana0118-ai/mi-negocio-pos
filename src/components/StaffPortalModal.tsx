import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Product } from '../types/database';
import { 
  X, UserCheck, Clock, Utensils, LogOut, 
  CheckCircle2, ArrowRight, Delete, Plus, Minus, 
  ShoppingBag, Sparkles, Camera, MapPin, AlertTriangle, RotateCcw
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

type AttendanceType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';

function calculateDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
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
  
  const [step, setStep] = useState<'pin' | 'actions' | 'attendance_verify' | 'meal'>('pin');
  const [pendingEventType, setPendingEventType] = useState<AttendanceType>('clock_in');

  // Estados GPS
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Estados Cámara
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);

  // Estados Colación y Productos
  const [products, setProducts] = useState<Product[]>([]);
  const [mealCart, setMealCart] = useState<MealItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const MAX_ALLOWED_DISTANCE_METERS = 80;

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

  // Ciclo de vida de la cámara
  useEffect(() => {
    if (step === 'attendance_verify' && !capturedPhoto) {
      startCamera();
      requestLocation();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [step, capturedPhoto]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError('Permiso de cámara denegado o no disponible.');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Este dispositivo no soporta geolocalización.');
      return;
    }

    setIsLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude, accuracy });

        const savedLat = localStorage.getItem('restaurant_lat');
        const savedLng = localStorage.getItem('restaurant_lng');

        if (savedLat && savedLng) {
          const d = calculateDistanceInMeters(
            latitude,
            longitude,
            parseFloat(savedLat),
            parseFloat(savedLng)
          );
          setDistanceMeters(d);
        } else {
          setDistanceMeters(0);
        }
        setIsLocating(false);
      },
      () => {
        setGpsError('No se pudo obtener el GPS. Activa la ubicación de tu móvil.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSetCurrentAsRestaurantLocation = () => {
    if (userLocation) {
      localStorage.setItem('restaurant_lat', userLocation.lat.toString());
      localStorage.setItem('restaurant_lng', userLocation.lng.toString());
      setDistanceMeters(0);
      alert('¡Ubicación del restaurante fijada con éxito en este punto!');
    }
  };

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

  const initiateAttendanceCheck = (type: AttendanceType) => {
    setPendingEventType(type);
    setCapturedPhoto(null);
    setStep('attendance_verify');
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 360;
    canvas.height = video.videoHeight || 360;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const photoBase64 = canvas.toDataURL('image/jpeg', 0.6);
      setCapturedPhoto(photoBase64);
      stopCamera();
    }
  };

  const handleConfirmAttendanceWithProof = async () => {
    if (!authenticatedStaff || !capturedPhoto) return;
    setSubmitting(true);

    try {
      const labels: Record<AttendanceType, string> = {
        clock_in: 'Entrada registrada con éxito',
        clock_out: 'Salida de turno registrada',
        break_start: 'Inicio de colación registrado',
        break_end: 'Regreso de colación registrado',
      };

      const { error } = await supabase.from('staff_attendance').insert({
        staff_id: authenticatedStaff.id,
        type: pendingEventType,
        event_type: pendingEventType,
        latitude: userLocation?.lat || null,
        longitude: userLocation?.lng || null,
        accuracy: userLocation?.accuracy || null,
        distance_meters: distanceMeters,
        photo_base64: capturedPhoto,
        verified: true,
      });

      if (error) throw error;

      setSuccessMessage(labels[pendingEventType]);
      setTimeout(() => {
        onSelectStaff(authenticatedStaff);
        onClose();
      }, 1400);
    } catch (err: any) {
      alert('Error guardando marca: ' + (err?.message || 'Error de base de datos'));
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
    (acc, it) => acc + (Number(it.product?.price) || 0) * it.quantity,
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

  const isTooFar = distanceMeters !== null && distanceMeters > MAX_ALLOWED_DISTANCE_METERS;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <canvas ref={canvasRef} className="hidden" />

      <div className={`w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border transition-all my-auto ${
        isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        
        {/* Cabecera */}
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
                Asistencia DT, colaciones y turnos
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
                      ? 'bg-rose-500'
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

        {/* Paso 2: Menú de Acciones */}
        {step === 'actions' && authenticatedStaff && (
          <div className="space-y-4 py-1">
            <div className={`p-4 rounded-2xl border text-center space-y-0.5 ${
              isDark ? 'bg-zinc-950/90 border-zinc-800' : 'bg-slate-50 border-slate-200 shadow-2xs'
            }`}>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-500 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
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
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-emerald-400">{successMessage}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => initiateAttendanceCheck('clock_in')}
                    className="p-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex flex-col items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
                  >
                    <Clock className="w-4 h-4" />
                    <span className="text-xs">Marcar Entrada</span>
                  </button>

                  <button
                    onClick={() => initiateAttendanceCheck('clock_out')}
                    className="p-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex flex-col items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-xs">Marcar Salida</span>
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

        {/* Paso 2.5: Verificación de Asistencia con Cámara y GPS */}
        {step === 'attendance_verify' && (
          <div className="space-y-3.5 py-1">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  {pendingEventType === 'clock_in' ? 'Registrar Entrada' : 'Registrar Salida'}
                </h4>
                <p className="text-[11px] font-mono text-zinc-400">Verificación fotográfica y georreferencia</p>
              </div>
              <button
                onClick={() => setStep('actions')}
                className="text-xs font-mono font-bold text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                ← Volver
              </button>
            </div>

            {/* Comprobación de GPS */}
            <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs font-mono space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" /> Estado GPS:
                </span>
                {isLocating ? (
                  <span className="text-amber-400 animate-pulse">Obteniendo coordenadas...</span>
                ) : userLocation ? (
                  <span className="text-emerald-400 font-bold">Ubicación detectada</span>
                ) : (
                  <span className="text-rose-400">Sin señal</span>
                )}
              </div>

              {distanceMeters !== null && (
                <div className="flex items-center justify-between border-t border-zinc-800 pt-1">
                  <span className="text-zinc-400">Distancia al local:</span>
                  <span className={`font-bold ${isTooFar ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {distanceMeters} metros
                  </span>
                </div>
              )}

              {/* Botón de configuración si no se han fijado coordenadas */}
              {!localStorage.getItem('restaurant_lat') && userLocation && (
                <button
                  type="button"
                  onClick={handleSetCurrentAsRestaurantLocation}
                  className="w-full mt-1.5 py-1.5 px-2 bg-blue-600/20 border border-blue-500/40 text-blue-300 rounded-lg text-[10px] font-mono hover:bg-blue-600/30 transition cursor-pointer"
                >
                  📍 Fijar mi posición actual como punto del restaurante
                </button>
              )}

              {gpsError && (
                <p className="text-[10px] text-rose-400 flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {gpsError}
                </p>
              )}
            </div>

            {/* Bloqueo si está fuera de rango */}
            {isTooFar ? (
              <div className="p-4 bg-rose-950/30 border border-rose-500/30 rounded-2xl text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
                <p className="text-xs font-bold text-rose-200">Estás fuera del restaurante</p>
                <p className="text-[11px] text-zinc-400">
                  Estás a {distanceMeters}m del local. El radio máximo permitido es de {MAX_ALLOWED_DISTANCE_METERS}m.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Cuadro de Video / Foto */}
                <div className="relative w-full aspect-square max-w-[280px] mx-auto rounded-3xl overflow-hidden border-2 border-zinc-800 bg-black flex items-center justify-center shadow-inner">
                  {cameraError ? (
                    <p className="p-4 text-center text-xs text-rose-400">{cameraError}</p>
                  ) : capturedPhoto ? (
                    <img src={capturedPhoto} alt="Foto de marcaje" className="w-full h-full object-cover" />
                  ) : (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  )}

                  {!capturedPhoto && !cameraError && (
                    <div className="absolute inset-0 border-2 border-dashed border-white/20 rounded-full m-8 pointer-events-none" />
                  )}
                </div>

                {/* Botones de acción de cámara */}
                {!capturedPhoto ? (
                  <button
                    type="button"
                    onClick={capturePhoto}
                    disabled={!userLocation}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Capturar Fotografía</span>
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCapturedPhoto(null)}
                      className="py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Repetir</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmAttendanceWithProof}
                      disabled={submitting}
                      className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{submitting ? 'Guardando...' : 'Confirmar y Entrar'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Paso 3: Selección de Colación */}
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
                          ${(p.price || 0).toLocaleString('es-CL')}
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
                          <span className="font-mono text-xs font-black w-5 text-center text-emerald-500">
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
                          <Plus className="w-3.5 h-3.5 text-emerald-500" />
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
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-black text-slate-800 dark:text-zinc-200">
                    A descontar al personal:
                  </span>
                </div>
                <span className="text-base font-black font-mono text-emerald-500">
                  $0 CLP
                </span>
              </div>
            </div>

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