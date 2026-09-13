import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Clock, MapPin, ExternalLink, Eye, X, 
  Calendar, CheckCircle2, AlertTriangle, User, RefreshCw, ShieldCheck
} from 'lucide-react';

interface AttendanceRecord {
  id: string;
  type?: string;
  event_type?: string;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  distance_meters: number | null;
  photo_base64: string | null;
  verified: boolean;
  staff: {
    name: string;
    role: string;
  } | null;
}

interface StaffAttendanceAuditProps {
  isDark?: boolean;
}

export function StaffAttendanceAudit({ isDark = false }: StaffAttendanceAuditProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [activePhotoModal, setActivePhotoModal] = useState<AttendanceRecord | null>(null);

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff_attendance')
        .select(`
          id,
          type,
          event_type,
          created_at,
          latitude,
          longitude,
          accuracy,
          distance_meters,
          photo_base64,
          verified,
          staff:staff_id ( name, role )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecords((data as unknown as AttendanceRecord[]) || []);
    } catch (err: any) {
      console.error('Error cargando libro de asistencia:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, []);

  const filteredRecords = records.filter((r) => {
    const recordDate = new Date(r.created_at).toISOString().split('T')[0];
    const matchDate = selectedDate ? recordDate === selectedDate : true;
    const currentType = r.type || r.event_type || '';
    const matchType = filterType === 'all' ? true : currentType === filterType;
    return matchDate && matchType;
  });

  const totalEntriesToday = records.filter((r) => {
    const isToday = new Date(r.created_at).toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
    return isToday && (r.type === 'clock_in' || r.event_type === 'clock_in');
  }).length;

  const totalAlerts = records.filter((r) => (r.distance_meters || 0) > 80).length;

  const getEventBadge = (type?: string) => {
    switch (type) {
      case 'clock_in':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
            Entrada Turno
          </span>
        );
      case 'clock_out':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30">
            Salida Turno
          </span>
        );
      case 'break_start':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
            Inicio Colación
          </span>
        );
      case 'break_end':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/15 text-blue-500 border border-blue-500/30">
            Regreso Colación
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-700/30 text-zinc-400 border border-zinc-700">
            Marcación
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Tarjetas de Resumen Rápido DT */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={`p-4 rounded-2xl border ${
          isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-white border-slate-200'
        } shadow-xs flex items-center justify-between`}>
          <div>
            <p className="text-[11px] font-mono text-zinc-400 uppercase font-bold tracking-wider">Entradas Hoy</p>
            <h4 className="text-xl font-black mt-0.5">{totalEntriesToday}</h4>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className={`p-4 rounded-2xl border ${
          isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-white border-slate-200'
        } shadow-xs flex items-center justify-between`}>
          <div>
            <p className="text-[11px] font-mono text-zinc-400 uppercase font-bold tracking-wider">Cumplimiento Geocerca</p>
            <h4 className="text-xl font-black mt-0.5">
              {records.length > 0 ? `${Math.round(((records.length - totalAlerts) / records.length) * 100)}%` : '100%'}
            </h4>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className={`p-4 rounded-2xl border ${
          isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-white border-slate-200'
        } shadow-xs flex items-center justify-between`}>
          <div>
            <p className="text-[11px] font-mono text-zinc-400 uppercase font-bold tracking-wider">Alertas GPS &gt;80m</p>
            <h4 className={`text-xl font-black mt-0.5 ${totalAlerts > 0 ? 'text-rose-500' : 'text-zinc-400'}`}>
              {totalAlerts}
            </h4>
          </div>
          <div className={`p-2.5 rounded-xl border ${
            totalAlerts > 0 
              ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' 
              : 'bg-zinc-800/50 text-zinc-500 border-zinc-700'
          }`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className={`p-3.5 rounded-2xl border flex flex-wrap gap-2.5 items-center justify-between ${
        isDark ? 'bg-zinc-950/90 border-zinc-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs">
            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-zinc-100 focus:outline-hidden font-mono text-xs cursor-pointer"
            />
          </div>

          <div className="flex gap-1 overflow-x-auto">
            {[
              { label: 'Todos', value: 'all' },
              { label: 'Entradas', value: 'clock_in' },
              { label: 'Salidas', value: 'clock_out' },
              { label: 'Colaciones', value: 'break_start' },
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterType(f.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filterType === f.value
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isDark ? 'bg-zinc-900 text-zinc-400 hover:text-zinc-200' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={loadAttendance}
          className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition-all active:scale-95 cursor-pointer"
          title="Actualizar registros"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>

      {/* Tabla de Registros */}
      <div className={`rounded-2xl border overflow-hidden shadow-xs ${
        isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-white border-slate-200'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`border-b text-[11px] font-mono uppercase tracking-wider font-bold ${
              isDark ? 'bg-zinc-900/80 border-zinc-800 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}>
              <tr>
                <th className="py-3 px-4">Foto Selfie</th>
                <th className="py-3 px-4">Trabajador</th>
                <th className="py-3 px-4">Tipo Evento</th>
                <th className="py-3 px-4">Fecha y Hora</th>
                <th className="py-3 px-4">Validación GPS</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-zinc-500 animate-pulse">
                    Consultando libro de asistencia DT...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-zinc-500">
                    No se encontraron marcaciones para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((item) => {
                  const eventType = item.type || item.event_type;
                  const isFar = (item.distance_meters || 0) > 80;
                  const dateObj = new Date(item.created_at);
                  const formattedTime = dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  const formattedDate = dateObj.toLocaleDateString('es-CL');

                  return (
                    <tr key={item.id} className="hover:bg-zinc-900/40 transition-colors">
                      {/* Foto */}
                      <td className="py-2.5 px-4">
                        {item.photo_base64 ? (
                          <button
                            type="button"
                            onClick={() => setActivePhotoModal(item)}
                            className="relative group w-11 h-11 rounded-xl overflow-hidden border border-zinc-700 bg-black block cursor-pointer"
                          >
                            <img src={item.photo_base64} alt="Selfie" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-3.5 h-3.5 text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="w-11 h-11 rounded-xl border border-dashed border-zinc-700 flex items-center justify-center text-zinc-600">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                      </td>

                      {/* Colaborador */}
                      <td className="py-2.5 px-4 font-sans">
                        <p className="font-bold text-zinc-200 text-xs">{item.staff?.name || 'Garzón'}</p>
                        <p className="text-[10px] text-zinc-400 capitalize font-mono">{item.staff?.role || 'Personal'}</p>
                      </td>

                      {/* Evento */}
                      <td className="py-2.5 px-4 font-sans">
                        {getEventBadge(eventType)}
                      </td>

                      {/* Timestamp */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5 text-zinc-200">
                          <Clock className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="font-bold">{formattedTime}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500">{formattedDate}</span>
                      </td>

                      {/* Geocerca GPS */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${isFar ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                          <span className={`text-xs font-bold ${isFar ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {item.distance_meters !== null ? `${item.distance_meters} metros` : 'En local'}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 block">
                          {isFar ? '⚠️ Fuera del local' : 'Certificado dentro del radio'}
                        </span>
                      </td>

                      {/* Enlace a Google Maps */}
                      <td className="py-2.5 px-4 text-center">
                        {item.latitude && item.longitude ? (
                          <a
                            href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition text-[11px] font-sans"
                            title="Ver en Google Maps"
                          >
                            <MapPin className="w-3 h-3 text-blue-400" />
                            <span>Mapa</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        ) : (
                          <span className="text-[10px] text-zinc-600">Sin GPS</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Vista de Fotografía en Alta Resolución */}
      {activePhotoModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h4 className="font-bold text-sm text-zinc-100">{activePhotoModal.staff?.name || 'Personal'}</h4>
                <p className="text-[11px] font-mono text-zinc-400">
                  {new Date(activePhotoModal.created_at).toLocaleString('es-CL')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePhotoModal(null)}
                className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden border-2 border-zinc-800 aspect-square bg-black shadow-inner">
              {activePhotoModal.photo_base64 && (
                <img
                  src={activePhotoModal.photo_base64}
                  alt="Selfie de Asistencia"
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-400">Distancia registrada:</span>
                <span className="font-bold text-emerald-400">{activePhotoModal.distance_meters ?? 0} metros</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Coordenadas:</span>
                <span className="text-zinc-300 text-[10px]">
                  {activePhotoModal.latitude?.toFixed(5)}, {activePhotoModal.longitude?.toFixed(5)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActivePhotoModal(null)}
              className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Cerrar Detalle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}