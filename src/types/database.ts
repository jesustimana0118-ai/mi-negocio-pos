export interface RestaurantTable {
  id: string;
  table_number: number;
  name: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'billed';
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface Order {
  id: string;
  order_number: number;
  table_id: string;
  subtotal_net: number;
  iva_amount: number;
  tip_amount: number;
  total_amount: number;
  status: 'open' | 'closed' | 'cancelled';
  payment_method?: string | null;
  waiter_name?: string | null;
  created_at: string;
  closed_at?: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  status: 'pending' | 'preparing' | 'ready' | 'served';
  created_at?: string;
}