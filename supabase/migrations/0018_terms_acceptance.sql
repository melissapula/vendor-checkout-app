-- Records when a store owner accepted the Terms of Service / Privacy
-- Policy (src/screens/TermsScreen.tsx) — stamped by AuthContext.createStore
-- the moment store creation succeeds, which the UI only allows once the
-- checkbox on CreateStoreScreen is checked. Nullable since existing stores
-- created before this shipped never went through that gate.
alter table stores add column terms_accepted_at timestamptz;
