import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Users, UserPlus, Shield, Key, Trash2, 
  AlertTriangle, Loader2, X 
} from 'lucide-react';

interface StaffMember {
  id: string;
  name: string;
  role: 'admin' | 'cashier' | 'waiter' | 'kitchen';
  pin_code: string;
  is_active: boolean;
  created_at?: string;
}

interface StaffManagementViewProps {
  isDark?: boolean;
}

export function StaffManagementView({ isDark = true }: StaffManagementViewProps) {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados del Modal de Crear/Editar
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'cashier' | 'waiter' | 'kitchen'>('waiter');
  const [pinCode, setPinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function loadStaff() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setStaffList((data as StaffMember[]) || []);
    } catch (err) {
      console.error('Error cargando personal:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStaff();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingStaff(null);
    setName('');
    setRole('waiter');
    setPinCode('');
    setErrorMsg('');
    setShowModal(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || pinCode.length !== 4) {
      setErrorMsg('El nombre es obligatorio y el PIN debe tener exactamente 4 dígitos.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      // Verificar si el PIN ya está en uso por otro empleado
      const { data: existingPin } = await supabase
        .from('staff')
        .select('id, name')
        .eq('pin_code', pinCode)
        .maybeSingle();

      if (existingPin && (!editingStaff || existingPin.id !== editingStaff.id)) {
        setErrorMsg(`Este PIN de 4 dígitos ya está asignado a ${existingPin.name}. Elige otro.`);
        setSubmitting(false);
        return;
      }

      if (editingStaff) {
        // Actualizar
        const { error } = await supabase
          .from('staff')
          .update({
            name: name.trim(),
            role,
            pin_code: pinCode,
          })
          .eq('id', editingStaff.id);

        if (error) throw error;
      } else {
        // Crear nuevo
        const { error } = await supabase
          .from('staff')
          .insert({
            name: name.trim(),
            role,
            pin_code: pinCode,
            is_active: true,
          });

        if (error) throw error;
      }

      setShowModal(false);
      loadStaff();
    } catch (err: any) {
      setErrorMsg('Error al guardar: ' + (err?.message || 'Error desconocido'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStaff = async (id: string, staffName: string) => {
    if (!confirm(`¿Estás seguro de eliminar a ${staffName}? Perderá su acceso al sistema.`)) return;

    try {
      const { error } = await supabase.from('staff').delete().eq('id', id);
      if (error) throw error;
      loadStaff();
    } catch (err: any) {
      alert('Error eliminando trabajador: ' + err.message);
    }
  };

  const getRoleBadge = (r: string) => {
    switch (r) {
      case 'admin':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/30">Administrador</span>;
      case 'cashier':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">Cajero</span>;
      case 'kitchen':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30">Cocina (KDS)</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/30">Garzón</span>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4 ${
        isDark ? 'border-zinc-800' : 'border-slate-200'
      }`}>
        <div>
          <h2 className={`text-base font-extrabold flex items-center gap-2 ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Users className="w-4 h-4" />
            </span>
            Gestión de Personal & Roles
          </h2>
          <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-600 font-medium'}`}>
            Administra los trabajadores, sus permisos por rol y códigos PIN de acceso
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition active:scale-95 shadow-md shadow-blue-600/20 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Nuevo Trabajador</span>
        </button>
      </div>

      {/* Tabla de Personal */}
      <div className={`rounded-2xl border overflow-hidden shadow-xs ${
        isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className={`border-b text-[11px] uppercase ${
              isDark ? 'bg-zinc-950 text-zinc-400 border-zinc-800' : 'bg-slate-50 text-slate-700 border-slate-200 font-bold'
            }`}>
              <tr>
                <th className="p-3.5">Nombre</th>
                <th className="p-3.5">Rol / Área</th>
                <th className="p-3.5">PIN de Acceso</th>
                <th className="p-3.5 text-center">Estado</th>
                <th className="p-3.5 text-center">Acciones</th>
              </tr>
            </thead>

            <tbody className={`divide-y ${isDark ? 'divide-zinc-800/80' : 'divide-slate-200/80'}`}>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-zinc-500">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      Cargando personal...
                    </div>
                  </td>
                </tr>
              ) : staffList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-zinc-500">
                    No hay trabajadores registrados en la base de datos.
                  </td>
                </tr>
              ) : (
                staffList.map((st) => (
                  <tr key={st.id} className={isDark ? 'hover:bg-zinc-800/40' : 'hover:bg-slate-50/80'}>
                    <td className="p-3.5 font-bold font-sans text-sm">
                      {st.name}
                    </td>

                    <td className="p-3.5">
                      {getRoleBadge(st.role)}
                    </td>

                    <td className="p-3.5">
                      <span className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-bold text-amber-400 tracking-widest">
                        ••••
                      </span>
                    </td>

                    <td className="p-3.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        st.is_active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-500'
                      }`}>
                        {st.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    <td className="p-3.5 text-center flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingStaff(st);
                          setName(st.name);
                          setRole(st.role);
                          setPinCode(st.pin_code);
                          setErrorMsg('');
                          setShowModal(true);
                        }}
                        className={`px-2.5 py-1 rounded-lg border text-xs transition cursor-pointer ${
                          isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white' : 'bg-slate-100 border-slate-300 text-slate-700'
                        }`}
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteStaff(st.id, st.name)}
                        className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR / EDITAR TRABAJADOR */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
          <div className={`w-full max-w-md rounded-3xl p-5 border shadow-2xl space-y-4 ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isDark ? 'border-zinc-800' : 'border-slate-100'
            }`}>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" />
                <h3 className="font-bold text-sm">
                  {editingStaff ? 'Editar Trabajador' : 'Registrar Nuevo Trabajador'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className={`p-1.5 rounded-lg cursor-pointer transition ${
                  isDark ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-100' : 'bg-slate-100 text-slate-400 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="space-y-3.5 font-mono text-xs">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 font-sans font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className={isDark ? 'text-zinc-400' : 'text-slate-600 font-semibold'}>Nombre Completo:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Carlos Muñoz"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-sm font-sans font-bold outline-none ${
                    isDark ? 'bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                  }`}
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className={isDark ? 'text-zinc-400' : 'text-slate-600 font-semibold'}>Rol / Permisos en el Sistema:</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-bold outline-none ${
                    isDark ? 'bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                  }`}
                >
                  <option value="waiter">Garzón (Acceso a Salón y Mesas)</option>
                  <option value="kitchen">Cocina (Acceso exclusivo pantalla KDS)</option>
                  <option value="cashier">Cajero (Acceso a Terminal de Caja y Cobros)</option>
                  <option value="admin">Administrador (Acceso Total y Reportes)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className={isDark ? 'text-zinc-400' : 'text-slate-600 font-semibold flex items-center gap-1'}>
                  <Key className="w-3.5 h-3.5 text-amber-500" /> PIN de Acceso (Exactamente 4 Dígitos):
                </label>
                <input
                  type="text"
                  maxLength={4}
                  required
                  placeholder="Ej: 1234"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                  className={`w-full p-2.5 rounded-xl border text-center text-lg tracking-widest font-black outline-none ${
                    isDark ? 'bg-zinc-950 border-zinc-700 text-amber-400 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-amber-600 focus:border-blue-500'
                  }`}
                />
                <p className="text-[10px] text-zinc-400 font-sans">
                  Este código numérico lo usará el trabajador para iniciar sesión rápida en el POS.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition cursor-pointer active:scale-95 shadow-md shadow-blue-600/20"
              >
                {submitting ? 'Guardando...' : editingStaff ? 'Actualizar Trabajador' : 'Crear Trabajador'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}