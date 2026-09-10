import { supabase } from './supabase';
import { AdjustmentType, InventoryAdjustment, Piece } from '../types/database';

export interface AdjustmentResult {
  piece: Piece;
  adjustment: InventoryAdjustment;
}

export async function logInventoryAdjustment(
  pieceId: string,
  type: AdjustmentType,
  quantity: number,
  reason: string | null
): Promise<AdjustmentResult> {
  const { data, error } = await supabase.rpc('log_inventory_adjustment', {
    p_piece_id: pieceId,
    p_type: type,
    p_quantity: quantity,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}
