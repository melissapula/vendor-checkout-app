// Hand-authored to match supabase/migrations/0001_init.sql.
// Once the Supabase project exists, replace this with the generated version:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type PieceType = 'original' | 'print' | 'sticker' | 'pin' | 'postcard' | string;
export type PieceStatus = 'available' | 'sold' | 'reserved';
export type SaleChannel = 'show' | 'online' | 'studio';
export type PaymentMethod = 'card' | 'venmo' | 'paypal' | 'cash_app' | 'cash';
export type DealType = 'bundle_price' | 'percent_off' | 'amount_off' | 'bogo';

// `type` rather than `interface`: interfaces don't satisfy TS's implicit
// index-signature check against Record<string, unknown>, which breaks
// supabase-js's generic inference for .insert()/.update() (resolves table
// argument types to `never`). Type aliases for object shapes do satisfy it.
export type Piece = {
  id: string;
  store_id: string;
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
};

export type Sale = {
  id: string;
  store_id: string;
  piece_id: string;
  sale_price: number;
  tip_amount: number | null;
  payment_method: PaymentMethod;
  fee_amount: number;
  sale_date: string;
  processor_payment_id: string | null;
  location: string | null;
};

export type Deal = {
  id: string;
  store_id: string;
  name: string;
  type: DealType;
  trigger_condition: Record<string, unknown>;
  discount_value: number;
  stackable: boolean;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  applies_to: Record<string, unknown>;
};

export type Store = {
  id: string;
  owner_id: string;
  name: string;
  admin_pin: string;
  created_at: string;
  enabled_payment_methods: PaymentMethod[];
  pass_fee_to_buyer: boolean;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  venmo_username: string | null;
  paypal_me_username: string | null;
  cash_app_cashtag: string | null;
};

// supabase-js v2's client generic expects this full shape (Relationships,
// Views, Functions, etc.) even when unused — a minimal { Row, Insert, Update }
// per table isn't enough for it to infer .insert()/.update() argument types.
export type Database = {
  public: {
    Tables: {
      pieces: {
        Row: Piece;
        Insert: Partial<Piece>;
        Update: Partial<Piece>;
        Relationships: [];
      };
      sales: {
        Row: Sale;
        Insert: Partial<Sale>;
        Update: Partial<Sale>;
        Relationships: [];
      };
      deals: {
        Row: Deal;
        Insert: Partial<Deal>;
        Update: Partial<Deal>;
        Relationships: [];
      };
      stores: {
        Row: Store;
        Insert: Partial<Store>;
        Update: Partial<Store>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
