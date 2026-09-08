# SPEC.md: Sistema Comercial "Mi Negocio - POS & Finanzas"

**Versión:** 1.0.0-draft

**Estado:** Aprobado para Fase de Construcción

**Autor:** Staff Software Engineer & Fullstack Architect

**Metodología:** Agent Skills (Addy Osmani) — *Spec-Driven Development*

**Dominio:** Restauración, Punto de Venta (POS), Control de Inventario por Escandallo y Gestión Financiera/Tributaria (Régimen ProPyme / Chile).

---

## 1. Visión y Objetivos del Sistema

### 1.1. Contexto y Problema Operativo

El prototipo inicial basado en hojas de cálculo y formularios manuales genera fricción operativa crítica:

* **Tiempos de atención lentos:** Registro manual tardío de comandas y pagos.
* **Falta de control en caja:** Cierres vulnerables al cuadre forzado ("maquillaje" de arqueo).
* **Desconexión entre venta e inventario:** Desconocimiento de mermas y costo real por plato en tiempo real.
* **Incertidumbre tributaria:** Cálculo manual propenso a errores de IVA Débito vs. Crédito Fiscal y PPM.

### 1.2. Solución Arquitectónica

Una **Web App Progresiva (PWA)** de alta disponibilidad y baja latencia, optimizada para terminales táctiles (garzones/cajeros) y pantallas directivas (administrador/dueño).

* **Backend:** Supabase (PostgreSQL 15+, Supabase Auth, Row Level Security, Edge Functions/RPC transaccionales).
* **Frontend:** Next.js / Vite + React, Tailwind CSS, TypeScript estricto, Radix UI/Tailwind primitives bajo estándar *Impeccable*.

---

## 2. Definición del Dominio y Reglas de Negocio

### 2.1. Régimen Tributario y Financiero (Chile)

1. **IVA (Impuesto al Valor Agregado - 19%):**
* Venta con Boleta: Precio publicado incluye IVA ($Total = Neto \times 1.19$).
* Venta/Compra con Factura: Registro explícito de $Monto\_Neto$ + $IVA\_19\%$ = $Monto\_Total$.
* **Balance Mensual de IVA:**

$$\Delta IVA = \sum IVA\text{ Débito (Ventas)} - \left(\sum IVA\text{ Crédito (Compras)} + \sum IVA\text{ Crédito (Gastos Operativos con Factura)}\right)$$




2. **PPM (Pago Provisional Mensual):**
* Tasa base: 1.0% aplicable estrictamente sobre las ventas netas del periodo fiscal:

$$PPM = \sum Ventas\_Netas \times 0.01$$




3. **Propina Voluntaria (Ley 20.918 - 10% Sugerido):**
* Calculada como el 10% del total de consumo en mesa.
* **Naturaleza no tributable:** No constituye ingreso del negocio, no devenga IVA y no afecta la base imponible del PPM.
* Debe segregarse en el pago y liquidarse íntegramente al personal.



### 2.2. Operación de Caja: Arqueo Ciego (Blind Shift Close)

* Al cerrar el turno, el cajero/garzón **no ve** los totales recaudados según el sistema.
* El usuario ingresa físicamente:
* Desglose de efectivo por denominaciones o monto total contado.
* Comprobantes de transacciones de tarjetas (Transbank / POS de débito y crédito).
* Comprobantes de transferencias bancarias directas.


* El sistema ejecuta una función segura (`SECURITY DEFINER`) que compara:

$$Diferencia = Declarado - Esperado$$


* La discrepancia se registra de forma inmutable para auditoría del Dueño.

### 2.3. Control de Inventario por Escandallo (Bill of Materials)

* Cada producto vendido puede tener una receta compuesta por múltiples materias primas/ingredientes (`product_recipes`).
* Cada ingrediente maneja factor de merma ($0 \le \text{merma} < 1$):

$$Consumo\_Real = \frac{Cantidad\_Receta}{1 - Factor\_Merma}$$


* Al confirmarse el pago de la orden (o el despacho a cocina según configuración), se descuenta el stock de manera atómica mediante un trigger o transacción SQL.

---

## 3. Modelo de Datos Relacional (PostgreSQL DDL)

```sql
-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TIPOS ENUMERADOS
-- ============================================================================
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'cashier', 'waiter');
CREATE TYPE table_status AS ENUM ('available', 'occupied', 'billed', 'maintenance');
CREATE TYPE order_status AS ENUM ('open', 'in_kitchen', 'served', 'paid', 'cancelled');
CREATE TYPE order_item_status AS ENUM ('pending', 'cooking', 'served', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'card_debit', 'card_credit', 'transfer', 'mixed');
CREATE TYPE document_type AS ENUM ('boleta', 'factura', 'ticket_interno');
CREATE TYPE shift_status AS ENUM ('open', 'closed');
CREATE TYPE unit_type AS ENUM ('kg', 'g', 'l', 'ml', 'unit');
CREATE TYPE inventory_movement_type AS ENUM ('purchase', 'sale_recipe', 'waste_loss', 'adjustment_manual');
CREATE TYPE expense_category AS ENUM (
  'utilities_electricity', 
  'utilities_water', 
  'utilities_gas', 
  'fuel', 
  'rent', 
  'payroll', 
  'maintenance', 
  'services', 
  'supplies', 
  'other'
);

-- ============================================================================
-- 1. PERFILES Y ACCESO (auth.users extension)
-- ============================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'waiter',
  full_name VARCHAR(120) NOT NULL,
  pin_code VARCHAR(6), -- Para desbloqueo rápido de POS
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 2. TURNOS Y ARQUEO DE CAJA
-- ============================================================================
CREATE TABLE public.cash_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opened_by UUID NOT NULL REFERENCES public.profiles(id),
  closed_by UUID REFERENCES public.profiles(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  closed_at TIMESTAMPTZ,
  status shift_status NOT NULL DEFAULT 'open',
  initial_cash NUMERIC(12, 2) NOT NULL CHECK (initial_cash >= 0),
  
  -- Valores registrados por el sistema (calculados automáticamente al cerrar)
  system_cash NUMERIC(12, 2) DEFAULT 0.00,
  system_card NUMERIC(12, 2) DEFAULT 0.00,
  system_transfer NUMERIC(12, 2) DEFAULT 0.00,
  system_tips NUMERIC(12, 2) DEFAULT 0.00,
  
  -- Valores digitados por el cajero (Arqueo Ciego)
  declared_cash NUMERIC(12, 2),
  declared_card NUMERIC(12, 2),
  declared_transfer NUMERIC(12, 2),
  
  -- Discrepancias resultantes
  difference_cash NUMERIC(12, 2),
  difference_card NUMERIC(12, 2),
  difference_transfer NUMERIC(12, 2),
  
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 3. MESAS Y SALÓN
-- ============================================================================
CREATE TABLE public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_number INT NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  capacity INT NOT NULL DEFAULT 4 CHECK (capacity > 0),
  status table_status NOT NULL DEFAULT 'available',
  current_shift_id UUID REFERENCES public.cash_shifts(id),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================================
-- 4. BODEGA E INGREDIENTES (MATERIAS PRIMAS)
-- ============================================================================
CREATE TABLE public.ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  unit unit_type NOT NULL,
  current_stock NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  min_stock NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  cost_per_unit NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (cost_per_unit >= 0),
  last_cost NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 5. CATEGORÍAS Y PRODUCTOS (MENÚ DE VENTA)
-- ============================================================================
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(80) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES public.product_categories(id),
  sku VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0), -- Precio de venta bruto con IVA
  has_recipe BOOLEAN NOT NULL DEFAULT false,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 6. ESCANDALLO (RECETAS / BILL OF MATERIALS)
-- ============================================================================
CREATE TABLE public.product_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id),
  gross_quantity NUMERIC(14, 4) NOT NULL CHECK (gross_quantity > 0),
  waste_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (waste_percentage >= 0 AND waste_percentage < 100),
  net_quantity NUMERIC(14, 4) GENERATED ALWAYS AS (gross_quantity / (1 - (waste_percentage / 100))) STORED,
  UNIQUE(product_id, ingredient_id)
);

-- ============================================================================
-- 7. ÓRDENES Y COMANDAS (POS)
-- ============================================================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id UUID NOT NULL REFERENCES public.cash_shifts(id),
  table_id UUID REFERENCES public.restaurant_tables(id),
  waiter_id UUID NOT NULL REFERENCES public.profiles(id),
  cashier_id UUID REFERENCES public.profiles(id),
  order_number BIGSERIAL,
  status order_status NOT NULL DEFAULT 'open',
  
  -- Desglose Financiero
  subtotal_net NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  iva_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  tip_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- 10% voluntario exento de IVA
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- subtotal_net + iva_amount + tip_amount
  
  payment_method payment_method,
  document_type document_type DEFAULT 'ticket_interno',
  document_number VARCHAR(50),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  paid_at TIMESTAMPTZ
);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  notes TEXT,
  status order_item_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 8. COMPRAS (FACTURAS PROVEEDORES)
-- ============================================================================
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_rut VARCHAR(12) NOT NULL,
  supplier_name VARCHAR(150) NOT NULL,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL,
  net_amount NUMERIC(12, 2) NOT NULL CHECK (net_amount >= 0),
  iva_credit NUMERIC(12, 2) NOT NULL CHECK (iva_credit >= 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'paid',
  registered_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id),
  quantity NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  unit_cost_net NUMERIC(14, 4) NOT NULL CHECK (unit_cost_net >= 0),
  total_cost_net NUMERIC(12, 2) NOT NULL CHECK (total_cost_net >= 0)
);

-- ============================================================================
-- 9. GASTOS OPERATIVOS (OPEX)
-- ============================================================================
CREATE TABLE public.operational_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category expense_category NOT NULL,
  description TEXT NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  has_invoice BOOLEAN NOT NULL DEFAULT false,
  net_amount NUMERIC(12, 2) NOT NULL CHECK (net_amount >= 0),
  iva_credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (iva_credit >= 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  receipt_voucher_url TEXT,
  registered_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 10. KARDEX / AUDITORÍA DE INVENTARIO
-- ============================================================================
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id),
  movement_type inventory_movement_type NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL, -- Positivo (entrada) o negativo (salida)
  stock_before NUMERIC(14, 4) NOT NULL,
  stock_after NUMERIC(14, 4) NOT NULL,
  reference_id UUID, -- order_id o purchase_id
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

```

---

## 4. Matriz de Roles y Políticas Row Level Security (RLS)

### 4.1. Matriz de Acceso por Módulo y Rol

| Módulo / Tabla | Dueño (`owner`) | Administrador (`admin`) | Cajero (`cashier`) | Garzón (`waiter`) |
| --- | --- | --- | --- | --- |
| **Perfiles (`profiles`)** | Full CRUD | Lectura / Edición básica | Ver propio | Ver propio |
| **Turnos Caja (`cash_shifts`)** | Full CRUD + Auditoría | Abrir / Cerrar / Ver todos | Abrir / Cierre Ciego | Sin acceso |
| **Mesas (`restaurant_tables`)** | Full CRUD | Full CRUD | Actualizar estado | Ver y actualizar estado |
| **Productos / Menú** | Full CRUD | Full CRUD | Solo Lectura | Solo Lectura |
| **Escandallos / Recetas** | Full CRUD | Full CRUD | Sin acceso | Sin acceso |
| **Órdenes y Detalle** | Full CRUD | Full CRUD | Ver turno / Cobrar | Crear y ver propias / mesa |
| **Ingredientes / Stock** | Full CRUD | Full CRUD | Sin acceso | Sin acceso |
| **Compras / Proveedores** | Full CRUD | Crear / Leer / Modificar | Sin acceso | Sin acceso |
| **Gastos Operativos** | Full CRUD | Crear / Leer | Sin acceso | Sin acceso |
| **Reporte Financiero / PPM** | Full Acceso | Acceso Operativo | Sin acceso | Sin acceso |

### 4.2. Implementación de Políticas RLS (Supabase)

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Función de ayuda: Obtener rol del usuario autenticado (sin recursión RLS)
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- POLÍTICAS: PROFILES
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins and Owners can view all profiles"
  ON public.profiles FOR SELECT
  USING (get_auth_role() IN ('owner', 'admin'));

CREATE POLICY "Owners can manage profiles"
  ON public.profiles FOR ALL
  USING (get_auth_role() = 'owner');

-- ----------------------------------------------------------------------------
-- POLÍTICAS: CASH_SHIFTS (Protección del Arqueo Ciego)
-- ----------------------------------------------------------------------------
CREATE POLICY "Staff can view open shift"
  ON public.cash_shifts FOR SELECT
  USING (status = 'open' OR get_auth_role() IN ('owner', 'admin'));

CREATE POLICY "Cashiers can create open shift"
  ON public.cash_shifts FOR INSERT
  WITH CHECK (
    get_auth_role() IN ('owner', 'admin', 'cashier') 
    AND opened_by = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- POLÍTICAS: CATÁLOGO Y PRODUCTOS
-- ----------------------------------------------------------------------------
CREATE POLICY "Public read for active products and categories"
  ON public.products FOR SELECT
  USING (is_available = true OR get_auth_role() IN ('owner', 'admin'));

CREATE POLICY "Admin and Owner manage products"
  ON public.products FOR ALL
  USING (get_auth_role() IN ('owner', 'admin'));

CREATE POLICY "Public read for categories"
  ON public.product_categories FOR SELECT
  USING (is_active = true OR get_auth_role() IN ('owner', 'admin'));

-- ----------------------------------------------------------------------------
-- POLÍTICAS: INGREDIENTES, RECETAS Y COMPRAS (Confidencialidad de Margen)
-- ----------------------------------------------------------------------------
CREATE POLICY "Only Admin and Owner can view/edit ingredients"
  ON public.ingredients FOR ALL
  USING (get_auth_role() IN ('owner', 'admin'));

CREATE POLICY "Only Admin and Owner can view/edit recipes"
  ON public.product_recipes FOR ALL
  USING (get_auth_role() IN ('owner', 'admin'));

CREATE POLICY "Only Admin and Owner can view/edit purchases"
  ON public.purchases FOR ALL
  USING (get_auth_role() IN ('owner', 'admin'));

CREATE POLICY "Only Admin and Owner can view/edit purchase items"
  ON public.purchase_items FOR ALL
  USING (get_auth_role() IN ('owner', 'admin'));

CREATE POLICY "Only Admin and Owner can view/edit expenses"
  ON public.operational_expenses FOR ALL
  USING (get_auth_role() IN ('owner', 'admin'));

-- ----------------------------------------------------------------------------
-- POLÍTICAS: ÓRDENES Y COMANDAS
-- ----------------------------------------------------------------------------
CREATE POLICY "Waiters and Cashiers can view orders of active shift"
  ON public.orders FOR SELECT
  USING (
    get_auth_role() IN ('owner', 'admin')
    OR shift_id IN (SELECT id FROM public.cash_shifts WHERE status = 'open')
  );

CREATE POLICY "Waiters and Cashiers can insert orders"
  ON public.orders FOR INSERT
  WITH CHECK (
    get_auth_role() IN ('owner', 'admin', 'waiter', 'cashier')
  );

CREATE POLICY "Cashiers and Admins can update orders for payment"
  ON public.orders FOR UPDATE
  USING (
    get_auth_role() IN ('owner', 'admin', 'cashier')
  );

CREATE POLICY "Items access linked to parent order"
  ON public.order_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o 
      WHERE o.id = order_items.order_id 
      AND (
        get_auth_role() IN ('owner', 'admin')
        OR o.shift_id IN (SELECT id FROM public.cash_shifts WHERE status = 'open')
      )
    )
  );

```

---

## 5. Procedimientos Transaccionales Críticos (RPCs)

### 5.1. Cierre Ciego de Turno (`close_cash_shift_blind`)

Garantiza que el cajero declare montos sin conocer los valores registrados por el sistema. El cálculo se ejecuta dentro de la base de datos de manera atómica.

```sql
CREATE OR REPLACE FUNCTION public.close_cash_shift_blind(
  p_shift_id UUID,
  p_declared_cash NUMERIC(12, 2),
  p_declared_card NUMERIC(12, 2),
  p_declared_transfer NUMERIC(12, 2),
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift RECORD;
  v_calc_cash NUMERIC(12, 2) := 0.00;
  v_calc_card NUMERIC(12, 2) := 0.00;
  v_calc_transfer NUMERIC(12, 2) := 0.00;
  v_calc_tips NUMERIC(12, 2) := 0.00;
  v_diff_cash NUMERIC(12, 2);
  v_diff_card NUMERIC(12, 2);
  v_diff_transfer NUMERIC(12, 2);
BEGIN
  -- Validar existencia y estado del turno
  SELECT * INTO v_shift FROM public.cash_shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El turno de caja especificado no existe.';
  END IF;
  IF v_shift.status = 'closed' THEN
    RAISE EXCEPTION 'El turno ya se encuentra cerrado.';
  END IF;

  -- Sumatoria de órdenes pagadas en el turno
  SELECT 
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN (total_amount - tip_amount) ELSE 0 END), 0) + v_shift.initial_cash,
    COALESCE(SUM(CASE WHEN payment_method IN ('card_debit', 'card_credit') THEN (total_amount - tip_amount) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN (total_amount - tip_amount) ELSE 0 END), 0),
    COALESCE(SUM(tip_amount), 0)
  INTO 
    v_calc_cash,
    v_calc_card,
    v_calc_transfer,
    v_calc_tips
  FROM public.orders
  WHERE shift_id = p_shift_id AND status = 'paid';

  -- Calcular diferencias
  v_diff_cash := p_declared_cash - v_calc_cash;
  v_diff_card := p_declared_card - v_calc_card;
  v_diff_transfer := p_declared_transfer - v_calc_transfer;

  -- Actualizar turno con sellado definitivo
  UPDATE public.cash_shifts
  SET 
    closed_by = auth.uid(),
    closed_at = timezone('utc'::text, now()),
    status = 'closed',
    system_cash = v_calc_cash,
    system_card = v_calc_card,
    system_transfer = v_calc_transfer,
    system_tips = v_calc_tips,
    declared_cash = p_declared_cash,
    declared_card = p_declared_card,
    declared_transfer = p_declared_transfer,
    difference_cash = v_diff_cash,
    difference_card = v_diff_card,
    difference_transfer = v_diff_transfer,
    notes = p_notes
  WHERE id = p_shift_id;

  -- Retornar resumen del arqueo
  RETURN jsonb_build_object(
    'shift_id', p_shift_id,
    'status', 'closed',
    'system_cash', v_calc_cash,
    'declared_cash', p_declared_cash,
    'difference_cash', v_diff_cash,
    'system_card', v_calc_card,
    'declared_card', p_declared_card,
    'difference_card', v_diff_card,
    'system_tips', v_calc_tips,
    'closed_at', now()
  );
END;
$$;

```

### 5.2. Descuento Automático de Stock por Receta (`deduct_recipe_inventory`)

```sql
CREATE OR REPLACE FUNCTION public.deduct_recipe_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_item RECORD;
  r_recipe RECORD;
  v_qty_to_deduct NUMERIC(14, 4);
  v_stock_curr NUMERIC(14, 4);
BEGIN
  -- Solo se activa cuando la orden transiciona a 'paid'
  IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
    FOR r_item IN 
      SELECT product_id, quantity 
      FROM public.order_items 
      WHERE order_id = NEW.id AND status <> 'cancelled'
    LOOP
      -- Iterar por los ingredientes del producto
      FOR r_recipe IN 
        SELECT ingredient_id, net_quantity 
        FROM public.product_recipes 
        WHERE product_id = r_item.product_id
      LOOP
        v_qty_to_deduct := r_recipe.net_quantity * r_item.quantity;

        -- Obtener stock actual con bloqueo de fila
        SELECT current_stock INTO v_stock_curr
        FROM public.ingredients
        WHERE id = r_recipe.ingredient_id
        FOR UPDATE;

        -- Actualizar stock
        UPDATE public.ingredients
        SET 
          current_stock = current_stock - v_qty_to_deduct,
          updated_at = timezone('utc'::text, now())
        WHERE id = r_recipe.ingredient_id;

        -- Registrar movimiento en el kardex
        INSERT INTO public.inventory_movements (
          ingredient_id,
          movement_type,
          quantity,
          stock_before,
          stock_after,
          reference_id,
          notes
        ) VALUES (
          r_recipe.ingredient_id,
          'sale_recipe',
          -v_qty_to_deduct,
          v_stock_curr,
          v_stock_curr - v_qty_to_deduct,
          NEW.id,
          'Descuento automático por Orden #' || NEW.order_number
        );
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_deduct_inventory_on_paid
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_recipe_inventory();

```

---

## 6. Panel Financiero y Cálculos Ejecutivos

### 6.1. Vista SQL de Balance Tributario Mensual

```sql
CREATE OR REPLACE VIEW public.view_tax_balance_monthly AS
WITH monthly_sales AS (
  SELECT 
    date_trunc('month', paid_at) AS fiscal_month,
    SUM(subtotal_net) AS total_sales_net,
    SUM(iva_amount) AS total_iva_debito,
    SUM(tip_amount) AS total_tips_collected,
    SUM(total_amount) AS total_gross_sales
  FROM public.orders
  WHERE status = 'paid'
  GROUP BY date_trunc('month', paid_at)
),
monthly_purchases AS (
  SELECT 
    date_trunc('month', invoice_date::timestamp) AS fiscal_month,
    SUM(net_amount) AS total_purchases_net,
    SUM(iva_credit) AS total_iva_credito_purchases
  FROM public.purchases
  GROUP BY date_trunc('month', invoice_date::timestamp)
),
monthly_expenses AS (
  SELECT 
    date_trunc('month', expense_date::timestamp) AS fiscal_month,
    SUM(net_amount) AS total_expenses_net,
    SUM(iva_credit) AS total_iva_credito_expenses
  FROM public.operational_expenses
  WHERE has_invoice = true
  GROUP BY date_trunc('month', expense_date::timestamp)
)
SELECT 
  s.fiscal_month,
  COALESCE(s.total_sales_net, 0) AS sales_net,
  COALESCE(s.total_iva_debito, 0) AS iva_debito,
  -- Total IVA Crédito
  COALESCE(p.total_iva_credito_purchases, 0) + COALESCE(e.total_iva_credito_expenses, 0) AS total_iva_credito,
  -- Diferencia IVA: Débito - Crédito
  (COALESCE(s.total_iva_debito, 0) - (COALESCE(p.total_iva_credito_purchases, 0) + COALESCE(e.total_iva_credito_expenses, 0))) AS iva_to_pay,
  -- PPM 1% sobre Ventas Netas
  ROUND(COALESCE(s.total_sales_net, 0) * 0.01, 2) AS ppm_estimated,
  -- Total a Pagar Formulario F29 estimado
  GREATEST(0, (COALESCE(s.total_iva_debito, 0) - (COALESCE(p.total_iva_credito_purchases, 0) + COALESCE(e.total_iva_credito_expenses, 0)))) 
  + ROUND(COALESCE(s.total_sales_net, 0) * 0.01, 2) AS total_f29_estimated,
  COALESCE(s.total_tips_collected, 0) AS tips_non_taxable
FROM monthly_sales s
LEFT JOIN monthly_purchases p ON s.fiscal_month = p.fiscal_month
LEFT JOIN monthly_expenses e ON s.fiscal_month = e.fiscal_month;

```

---

## 7. Estándar de Interfaz y Experiencia (Reglas "Impeccable")

### 7.1. Sistema Visual y Modo Oscuro Real

* **Paleta de Superficies:** Sin grises lavados ni azules saturados genéricos.
* Fondo de aplicación: `zinc-950` (`#09090b`).
* Tarjetas y paneles: `zinc-900` (`#18181b`).
* Bordes y separadores: `zinc-800/80` (`#27272a`).
* Acentos interactivos: Esmeralda (`emerald-500` / `#10b981`) para confirmaciones y cobros; Ámbar (`amber-500` / `#f59e0b`) para alertas y propinas; Rosa (`rose-500` / `#f43f5e`) para discrepancias de caja y cancelaciones.


* **Tipografía y Legibilidad de Cifras:**
* Tipografía base: `Inter` o `Geist Sans`.
* Cifras financieras, precios y cantidades: `font-mono tabular-nums` para alineación visual exacta de columnas de moneda y pesaje.
* Formato de moneda: Peso chileno formateado (`$ 12.500`), sin centavos visibles en la interfaz de venta, pero respetando decimales en costos unitarios de bodega (`$ 4,8500 / kg`).



### 7.2. Ergonomía Táctil en Punto de Venta (POS)

* **Áreas de Toque:** Elementos interactivos con altura mínima de `52px` (ideal `64px` para items de comanda y categorías).
* **Selector de Propina:** Botón toggle de 1 toque con cálculo automático instantáneo (+10%) y desglose claro: *Total Consumo + Propina Sugerida = Total a Pagar*.
* **Teclado Numérico para Arqueo Ciego:** Numpad en pantalla integrado de alta respuesta con vibración háptica suave en dispositivos móviles/tablets para agilizar el conteo de billetes y vouchers.

---

## 8. Plan de Implementación Incremental (Incremental Slices)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   SLICE 1    │ ──▶ │   SLICE 2    │ ──▶ │   SLICE 3    │ ──▶ │   SLICE 4    │
│  DB Core,    │     │  Catálogo,   │     │ Turnos Caja  │     │   POS Web    │
│  Auth & RLS  │     │ Ingredientes │     │   y Arqueo   │     │ Táctil + 10% │
└──────────────┘     │& Escandallos │     │    Ciego     │     │   Propina    │
                     └──────────────┘     └──────────────┘     └──────────────┘
                                                                       │
                     ┌──────────────┐     ┌──────────────┐             │
                     │   SLICE 6    │ ◀── │   SLICE 5    │ ◀───────────┘
                     │  Dashboard   │     │   Compras,   │
                     │  Financiero  │     │  Gastos Opex │
                     │  IVA & PPM   │     │  y Kardex    │
                     └──────────────┘     └──────────────┘

```

1. **Slice 1: Infraestructura de Datos, Autenticación y RLS**
* Ejecución del script DDL en Supabase.
* Creación de perfiles y prueba de aislamiento RLS por rol.


2. **Slice 2: Catálogo, Bodega y Escandallos (BOM)**
* CRUD de categorías, productos e ingredientes.
* Mapeo de recetas y cálculo de costo teórico por plato.


3. **Slice 3: Motor de Caja y Arqueo Ciego**
* Apertura de turno con fondo inicial.
* RPC `close_cash_shift_blind` y generación de comprobante de cuadre.


4. **Slice 4: Terminal POS Táctil y Comandas**
* Mapa de mesas y selección táctil de productos.
* Cálculo de propina 10% desacoplada de IVA y cobro rápido.


5. **Slice 5: Compras, Gastos Operativos y Descuento Automático de Stock**
* Registro de facturas con crédito fiscal.
* Disparo del trigger de descuento de ingredientes por venta.


6. **Slice 6: Panel Ejecutivo para el Dueño**
* Gráfico de flujo de caja y margen de contribución real.
* Semáforo tributario: IVA Débito vs. Crédito Fiscal y reserva de PPM mensual.



---

## 9. Criterios de Aceptación y Verificación

* [ ] **Aislamiento RLS:** Un usuario con rol `waiter` o `cashier` no puede consultar bajo ningún endpoint la tabla `purchases`, `operational_expenses` o recetas de productos.
* [ ] **Arqueo Ciego Inmutable:** Al llamar a la función de cierre de caja, el cajero recibe el reporte de diferencias únicamente después de registrar sus montos declarados.
* [ ] **Descuento de Stock Consistente:** Una orden pagada de 2 "Hamburguesas Clásicas" descuenta con precisión milimétrica el pan, carne y aderezos según el escandallo registrado.
* [ ] **Cálculo Tributario Exacto:** La propina voluntaria no genera IVA ni incrementa la base de cálculo del PPM en las vistas y reportes financieros.