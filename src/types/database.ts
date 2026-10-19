// Hand-authored to match supabase/migrations/0001_init.sql.
// Once the Supabase project exists, replace this with the generated version:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PieceType = 'original' | 'print' | 'sticker' | 'pin' | 'postcard' | string;
export type PieceStatus = 'available' | 'sold' | 'reserved';
export type SaleChannel = 'show' | 'online' | 'studio';
export type PaymentMethod = 'card' | 'venmo' | 'paypal' | 'cash_app' | 'cash';
export type FeeRate = { rate: number; fixed: number };
export type DealType = 'bundle_price' | 'percent_off' | 'amount_off' | 'bogo';
export type AdjustmentType = 'loss' | 'donation';

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
  size: string | null;
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
  info_url: string | null;
};

export type Sale = {
  id: string;
  store_id: string;
  piece_id: string;
  sale_price: number;
  tip_amount: number | null;
  payment_method: PaymentMethod;
  fee_amount: number;
  // The MFP Apps application fee on a card/Cash App sale, kept apart from
  // fee_amount (Stripe's fee). 0 for every other method. See
  // supabase/migrations/0023_sales_platform_fee.sql.
  platform_fee_amount: number;
  sale_date: string;
  processor_payment_id: string | null;
  location: string | null;
  // null = active sale. See supabase/migrations/0007_refund_void.sql.
  refunded_at: string | null;
  refund_reason: string | null;
};

export type InventoryAdjustment = {
  id: string;
  store_id: string;
  piece_id: string;
  type: AdjustmentType;
  quantity: number;
  reason: string | null;
  adjustment_date: string;
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

export type Event = {
  id: string;
  store_id: string;
  name: string;
  // Plain YYYY-MM-DD (a `date` column, not a timestamp) — a whole-day range
  // compared against each sale's sale_date at report time, not stored on
  // the sale itself. See supabase/migrations/0014_events.sql.
  start_date: string;
  end_date: string;
  notes: string | null;
  created_at: string;
};

// Frozen contents of a saved report — see supabase/migrations/
// 0015_saved_reports.sql. Line items are denormalized (piece title as
// plain text, not piece_id) so the snapshot stays meaningful even if the
// underlying piece or sale is later edited or deleted. Stored as jsonb, so
// (like Deal.applies_to) SavedReport keeps the column as Record<string,
// unknown> and callers cast to this shape — see src/screens/ReportsScreen.tsx.
export type ReportSnapshotSaleLine = {
  id: string;
  title: string;
  sale_price: number;
  tip_amount: number | null;
  payment_method: PaymentMethod;
  sale_date: string;
  refunded_at: string | null;
};

export type ReportSnapshot = {
  // platformFees is optional because snapshots saved before the platform fee
  // existed don't have it.
  summary: { count: number; gross: number; fees: number; platformFees?: number; tips: number; net: number };
  byType: { type: string; count: number; gross: number }[];
  sales: ReportSnapshotSaleLine[];
};

export type SavedReport = {
  id: string;
  store_id: string;
  title: string;
  notes: string | null;
  event_name: string | null;
  from_date: string | null;
  to_date: string | null;
  snapshot: Record<string, unknown>;
  created_at: string;
};

export type Store = {
  id: string;
  owner_id: string;
  name: string;
  admin_pin: string;
  require_admin_pin: boolean;
  low_stock_threshold: number;
  terms_accepted_at: string | null;
  // The Terms version last accepted (see src/lib/terms.ts), or null for a
  // store that hasn't accepted since versions began. Optional because the
  // column arrives with migration 0024.
  terms_version_accepted?: number | null;
  // Only ever true for the public demo store, which the database treats as
  // read-only. See supabase/migrations/0020_demo_read_only.sql.
  is_demo: boolean;
  // The saved color theme's name (see src/lib/theme.ts), or null if never
  // chosen. Optional because the column arrives with migration 0021 — the
  // app checks for it before trying to save one.
  theme?: string | null;
  created_at: string;
  enabled_payment_methods: PaymentMethod[];
  pass_fee_to_buyer: boolean;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  venmo_username: string | null;
  paypal_me_username: string | null;
  cash_app_cashtag: string | null;
  // Sparse — a method missing here falls back to fees.ts's own default rate
  // for that method. See supabase/migrations/0006_per_store_fee_overrides.sql.
  fee_overrides: Partial<Record<PaymentMethod, FeeRate>>;
};

// One row per store — the shared "current cart" every device signed into
// that store sees live. `items` is CartItem[] (defined in src/lib/cartItem.ts,
// not here, since it's an app-level shape built on Piece) stored as Json;
// the client casts on read the same way finalize_sale's sale_rows does.
export type StoreCart = {
  store_id: string;
  items: Json;
  location: string;
  updated_at: string;
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
      inventory_adjustments: {
        Row: InventoryAdjustment;
        Insert: Partial<InventoryAdjustment>;
        Update: Partial<InventoryAdjustment>;
        Relationships: [];
      };
      stores: {
        Row: Store;
        Insert: Partial<Store>;
        Update: Partial<Store>;
        Relationships: [];
      };
      store_carts: {
        Row: StoreCart;
        Insert: Partial<StoreCart>;
        Update: Partial<StoreCart>;
        Relationships: [];
      };
      events: {
        Row: Event;
        Insert: Partial<Event>;
        Update: Partial<Event>;
        Relationships: [];
      };
      saved_reports: {
        Row: SavedReport;
        Insert: Partial<SavedReport>;
        Update: Partial<SavedReport>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // Decrements each sold piece's quantity_remaining and inserts the
      // sale rows in one DB transaction — see
      // supabase/migrations/0005_atomic_finalize_sale.sql for why.
      finalize_sale: {
        Args: { sale_rows: Json };
        Returns: { sales: Sale[]; pieces: Piece[] };
      };
      // Marks a sale refunded and restores the sold piece's quantity_
      // remaining in one DB transaction — see
      // supabase/migrations/0007_refund_void.sql. For Stripe-paid sales,
      // call the stripe-refund-sale Edge Function instead (it calls this
      // itself after the real Stripe refund succeeds); call this directly
      // only for the self-reported methods (venmo/paypal/cash).
      refund_sale: {
        Args: { p_sale_id: string };
        Returns: { sale: Sale; piece: Piece | null };
      };
      // Decrements a piece's quantity_remaining and inserts the log row in
      // one DB transaction — see
      // supabase/migrations/0009_inventory_adjustments.sql.
      log_inventory_adjustment: {
        Args: { p_piece_id: string; p_type: AdjustmentType; p_quantity: number; p_reason: string | null };
        Returns: { piece: Piece; adjustment: InventoryAdjustment };
      };
      // Claims a beta invite code for the signed-in user, atomically and
      // idempotently — see supabase/migrations/0017_beta_invite_codes.sql.
      // Returns true if the code was valid and is now (or already was, for
      // this same user) claimed by them; false if invalid/already taken by
      // someone else.
      redeem_beta_code: {
        Args: { p_code: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
