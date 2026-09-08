import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Delete, X, Lock, AlertCircle } from 'lucide-react';

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  pin_code: string;
}

interface PinModalProps {
  onSuccess: (staff: StaffMember) => void;
  onClose?: () => void;
  requiredRole?: string;
}

export function PinModal({ onSuccess, onClose, requiredRole }: PinModalProps) {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMsg('');
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg('');
  };

  const verifyPin = async (inputPin: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, role, pin_code')
        .eq('pin_code', inputPin)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) {
        setErrorMsg('PIN incorrecto. Inténtalo de nuevo.');
        setPin('');
      } else {
        if (requiredRole && data.role !== requiredRole && data.role !== 'admin') {
          setErrorMsg(`Acceso denegado: Requiere rol ${requiredRole}`);
          setPin('');
        } else {
          onSuccess(data as StaffMember);
        }
      }
    } catch {
      setErrorMsg('Error de conexión.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-xs rounded-3xl p-6 shadow-2xl space-y-5 text-center select-none">
        {/* Cabecera */}
        <div className="flex items-center justify-between">
          <div className="w-6" />
          <div className="p-3 bg-zinc-800 text-amber-400 rounded-2xl border border-zinc-700 mx-auto shadow-inner">
            <Lock className="w-5 h-5" />
          </div>
          {onClose ? (
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-6" />
          )}
        </div>

        <div>
          <h3 className="text-base font-bold text-zinc-100">Identificación de Garzón</h3>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">Ingresa tu PIN de 4 dígitos</p>
        </div>

        {/* Indicadores de Dígitos (Puntos) */}
        <div className="flex justify-center gap-3 py-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={`w-4 h-4 rounded-full border transition-all duration-150 ${
                pin.length > index
                  ? 'bg-amber-400 border-amber-400 scale-110 shadow-lg shadow-amber-400/30'
                  : 'bg-zinc-950 border-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* Alerta de Error */}
        {errorMsg && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-rose-400 font-medium animate-shake">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Teclado Numérico Táctil */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              disabled={loading}
              className="h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700/80 active:bg-amber-400 active:text-zinc-950 text-lg font-bold font-mono text-zinc-100 transition active:scale-95 border border-zinc-700/60 shadow-sm"
            >
              {d}
            </button>
          ))}

          <button
            onClick={handleClear}
            disabled={loading}
            className="h-14 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-xs font-semibold text-zinc-400 transition active:scale-95 border border-zinc-800"
          >
            C
          </button>

          <button
            onClick={() => handleDigit('0')}
            disabled={loading}
            className="h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700/80 active:bg-amber-400 active:text-zinc-950 text-lg font-bold font-mono text-zinc-100 transition active:scale-95 border border-zinc-700/60 shadow-sm"
          >
            0
          </button>

          <button
            onClick={handleDelete}
            disabled={loading}
            className="h-14 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-zinc-400 flex items-center justify-center transition active:scale-95 border border-zinc-800"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <div className="pt-2 text-[10px] text-zinc-500 font-mono">
          PINs por defecto: Carlos (1234) • Vale (5678) • Admin (0000)
        </div>
      </div>
    </div>
  );
}