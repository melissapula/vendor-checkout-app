// Hand-authored to match supabase/migrations/0001_init.sql.
// Once the Supabase project exists, replace this with the generated version:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type PieceType = 'original' | 'print' | 'sticker' | 'pin' | 'postcard' | string;
export type PieceStatus = 'available' | 'sold' | 'reserved';
export type SaleChannel = 'show' | 'online' | 'studio';
export type PaymentMethod = 'square' | 'venmo' | 'paypal' | 'cash';
export type DealType = 'bundle_price' | 'percent_off' | 'amount_off' | 'bogo';

export interface Piece {
  id: string;
  sku: string;
  title: string;
  medium: string | null;
  width_in: number | null;
  height_in: number | null;
  series: string | null;
  price: number;
  cost_basis: number | null;
  status: PieceStatus;
  type: PieceType;
  original_id: string | null;
  print_run_size: number | null;
  quantity_remaining: number;
  date_created: string;
  date_sold: string | null;
  sale_channel: SaleChannel | null;
  notes: string | null;
  image_url: string | null;
}

export interface Sale {
  id: string;
  piece_id: string;
  sale_price: number;
  tip_amount: number | null;
  payment_method: PaymentMethod;
  fee_amount: number;
  sale_date: string;
  square_payment_id: string | null;
  location: string | null;
}

export interface Deal {
  id: string;
  name: string;
  type: DealType;
  trigger_condition: Record<string, unknown>;
  discount_value: number;
  stackable: boolean;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  applies_to: Record<string, unknown>;
}

export interface Database {
  public: {
    Tables: {
      pieces: { Row: Piece; Insert: Partial<Piece>; Update: Partial<Piece> };
      sales: { Row: Sale; Insert: Partial<Sale>; Update: Partial<Sale> };
      deals: { Row: Deal; Insert: Partial<Deal>; Update: Partial<Deal> };
    };
  };
}
