exports.up = async function (k) {
  await k.schema.createTable('document_sequences', t => {
    t.uuid('company_id').notNullable(); t.text('dataset_id').notNullable();
    t.text('prefix').notNullable(); t.integer('year').notNullable(); t.integer('last_number').notNullable();
    t.primary(['company_id', 'dataset_id', 'prefix', 'year']);
    t.foreign(['company_id', 'dataset_id']).references(['company_id', 'id']).inTable('datasets');
  });
  await k.schema.alterTable('inventory_balances', t => t.bigInteger('reserved').notNullable().defaultTo(0));
  await k.schema.alterTable('stock_movements', t => {
    t.bigInteger('reserved_delta').notNullable().defaultTo(0);
    t.bigInteger('reserved_after').notNullable().defaultTo(0);
  });
  await k.raw('ALTER TABLE inventory_balances ADD CONSTRAINT valid_reserved_stock CHECK (reserved >= 0 AND held + reserved <= physical)');
  await k.raw('ALTER TABLE stock_movements ADD CONSTRAINT valid_reserved_movement CHECK (reserved_after >= 0 AND held_after + reserved_after <= physical_after)');
  await k.schema.createTable('inventory_reservations', t => {
    t.uuid('id').primary(); t.uuid('company_id').notNullable(); t.text('dataset_id').notNullable();
    t.uuid('workorder_id').notNullable(); t.uuid('sales_id').notNullable(); t.uuid('item_id').notNullable();
    t.text('warehouse').notNullable().defaultTo('HQ-STORE'); t.bigInteger('quantity').notNullable();
    t.text('status').notNullable().defaultTo('Active'); t.timestamp('created_at', {useTz:true}).notNullable().defaultTo(k.fn.now());
    for (const key of ['workorder_id', 'sales_id', 'item_id']) t.foreign(['company_id', 'dataset_id', key]).references(['company_id', 'dataset_id', 'id']).inTable('records');
    t.unique(['company_id', 'dataset_id', 'workorder_id', 'item_id']);
    t.index(['company_id', 'dataset_id', 'item_id', 'status']);
  });
  await k.raw("ALTER TABLE inventory_reservations ADD CONSTRAINT valid_reservation CHECK (quantity > 0 AND status IN ('Active','Consumed','Released'))");
  await k.raw("CREATE UNIQUE INDEX one_approved_merch_sheet ON records (company_id, dataset_id, (data->>'source_sales_id')) WHERE resource='merchandising' AND status='Approved'");
  await k.raw("CREATE UNIQUE INDEX one_committed_workorder ON records (company_id, dataset_id, (data->>'source_sales_id')) WHERE resource='workorders' AND status NOT IN ('Draft','Cancelled')");
};
exports.down = async function () { throw new Error('Forward-only migration. Restore an isolated backup instead of dropping ERP records.'); };
