import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Utensils, DollarSign, Tag } from 'lucide-react';

interface ProductFormModalProps {
  product?: {
    id: string;
    name: string;
    category: string;
    price: number;
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProductFormModal({ product, onClose, onSuccess }: ProductFormModalProps) {
  const [name, setName] = useState(product?.name || '');
  const [category, setCategory] = useState(product?.category || 'Hamburguesas');
  const [price, setPrice] = useState(product?.price ? String(product.price) : '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price) return;

    setSaving(true);
    try {
      if (product) {
        // Actualizar existente
        const { error } = await supabase
          .from('products')
          .update({
            name,
            category,
            price: Number(price),
          })
          .eq('id', product.id);

        if (error) throw error;
      } else {
        // Crear nuevo plato
        const { error } = await supabase
          .from('products')
          .insert({
            name,
            category,
            price: Number(price),
            is_active: true,
          });

        if (error) throw error;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      alert('Error al guardar plato: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-violet-400" />
            <h3 className="font-bold text-sm text-zinc-100">
              {product ? 'Editar Producto' : 'Nuevo Producto / Plato'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="space-y-1">
            <label className="text-zinc-400 font-medium">Nombre del Plato / Bebida:</label>
            <input
              type="text"
              placeholder="Ej: Hamburguesa Doble Cheddar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-violet-500 rounded-xl px-3 py-2 text-zinc-100 outline-none font-medium"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label className="text-zinc-400 font-medium">Categoría:</label>
            <div className="relative">
              <Tag className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-violet-500 rounded-xl pl-8 pr-3 py-2 text-zinc-100 outline-none"
              >
                <option value="Hamburguesas">Hamburguesas</option>
                <option value="Acompañamientos">Acompañamientos</option>
                <option value="Bebidas">Bebidas</option>
                <option value="Postres">Postres</option>
                <option value="Bar & Cócteles">Bar & Cócteles</option>
              </select>
            </div>
          </div>

          <div className="space-y-1 font-mono">
            <label className="text-zinc-400 font-medium font-sans">Precio de Venta (IVA Inc.):</label>
            <div className="relative">
              <DollarSign className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="number"
                placeholder="Ej: 9990"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-violet-500 rounded-xl pl-8 pr-3 py-2 text-sm font-bold text-zinc-100 outline-none tabular-nums"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-lg mt-2"
          >
            {saving ? 'Guardando...' : product ? 'Guardar Cambios' : 'Crear Plato'}
          </button>
        </form>
      </div>
    </div>
  );
}