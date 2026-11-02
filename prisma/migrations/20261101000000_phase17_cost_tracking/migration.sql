-- Phase 17: Cost tracking por WBS/atividade + integracao Procurement -> Cost
-- (E08+): CostItem/Commitment/Actual passam a carregar wbsNodeId/activityId;
-- Commitment referencia PurchaseOrder; Actual referencia GoodsReceipt.

ALTER TABLE "cost_items"
  ADD COLUMN IF NOT EXISTS "activity_id" UUID;

ALTER TABLE "cost_commitments"
  ADD COLUMN IF NOT EXISTS "wbs_node_id" UUID,
  ADD COLUMN IF NOT EXISTS "activity_id" UUID,
  ADD COLUMN IF NOT EXISTS "purchase_order_id" UUID;

ALTER TABLE "cost_actuals"
  ADD COLUMN IF NOT EXISTS "wbs_node_id" UUID,
  ADD COLUMN IF NOT EXISTS "activity_id" UUID,
  ADD COLUMN IF NOT EXISTS "goods_receipt_id" UUID;

ALTER TABLE "cost_items"
  ADD CONSTRAINT "cost_items_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cost_commitments"
  ADD CONSTRAINT "cost_commitments_wbs_node_id_fkey"
  FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cost_commitments"
  ADD CONSTRAINT "cost_commitments_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cost_commitments"
  ADD CONSTRAINT "cost_commitments_purchase_order_id_fkey"
  FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cost_actuals"
  ADD CONSTRAINT "cost_actuals_wbs_node_id_fkey"
  FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cost_actuals"
  ADD CONSTRAINT "cost_actuals_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cost_actuals"
  ADD CONSTRAINT "cost_actuals_goods_receipt_id_fkey"
  FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
