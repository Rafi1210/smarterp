exports.up=async function(k){
 // Additive lookup indexes. No data reset, reseed or business posting.
 await k.raw("CREATE INDEX IF NOT EXISTS records_order_reference ON records(company_id,dataset_id,(data->>'source_sales_id'),resource) WHERE status NOT IN ('Deleted','Archived','Cancelled')");
 await k.raw("CREATE INDEX IF NOT EXISTS records_source_reference ON records(company_id,dataset_id,(data->>'source_id'),resource) WHERE status NOT IN ('Deleted','Archived','Cancelled')");
 await k.raw("CREATE INDEX IF NOT EXISTS records_receipt_reference ON records(company_id,dataset_id,(data->>'purchase_id')) WHERE resource='receipts' AND status NOT IN ('Deleted','Archived','Cancelled')");
 await k.raw("CREATE INDEX IF NOT EXISTS records_delivery_reference ON records(company_id,dataset_id,(data->>'workorder_id')) WHERE resource='deliveries' AND status NOT IN ('Deleted','Archived','Cancelled')");
};
exports.down=async()=>{throw Error('Forward-only migration. Preserve operational records.');};
