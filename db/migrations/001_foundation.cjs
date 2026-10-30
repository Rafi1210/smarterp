exports.up = async function (k) {
  await k.schema.createTable('app_context', t => { t.integer('id').primary(); t.text('environment').notNullable(); });
  await k.schema.createTable('companies', t => { t.uuid('id').primary(); t.text('name').notNullable(); t.text('currency').notNullable().defaultTo('BDT'); });
  await k.schema.createTable('datasets', t => {
    t.text('id').primary(); t.uuid('company_id').notNullable().references('id').inTable('companies'); t.text('name').notNullable(); t.boolean('operational').notNullable(); t.text('units').notNullable(); t.text('attribution').notNullable(); t.jsonb('warnings').notNullable(); t.unique(['company_id', 'id']);
  });
  await k.schema.createTable('records', t => {
    t.uuid('id').primary(); t.uuid('company_id').notNullable(); t.text('dataset_id').notNullable();
    t.text('resource').notNullable(); t.text('external_id').notNullable(); t.text('name').notNullable(); t.text('status').notNullable().defaultTo('Active');
    t.date('business_date'); t.jsonb('data').notNullable(); t.text('content_hash').notNullable(); t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(k.fn.now());
    t.foreign(['company_id', 'dataset_id']).references(['company_id', 'id']).inTable('datasets');
    t.unique(['company_id', 'dataset_id', 'resource', 'external_id']); t.unique(['company_id', 'dataset_id', 'id']);
    t.index(['company_id', 'dataset_id', 'resource', 'business_date']); t.index(['company_id', 'dataset_id', 'resource', 'status']);
  });
  await k.schema.createTable('record_links', t => {
    t.uuid('company_id').notNullable(); t.text('dataset_id').notNullable(); t.uuid('from_id').notNullable(); t.uuid('to_id').notNullable(); t.text('relation').notNullable();
    t.primary(['from_id', 'to_id', 'relation']);
    for (const field of ['from_id', 'to_id']) t.foreign(['company_id', 'dataset_id', field]).references(['company_id', 'dataset_id', 'id']).inTable('records');
  });
  await k.schema.createTable('document_lines', t => {
    t.uuid('id').primary(); t.uuid('company_id').notNullable(); t.text('dataset_id').notNullable(); t.uuid('document_id').notNullable(); t.text('external_line_id').notNullable();
    t.uuid('item_id').notNullable(); t.bigInteger('quantity').notNullable(); t.bigInteger('unit_price_minor').notNullable(); t.bigInteger('line_total_minor').notNullable(); t.text('uom').notNullable();
    t.foreign(['company_id', 'dataset_id', 'document_id']).references(['company_id', 'dataset_id', 'id']).inTable('records');
    t.foreign(['company_id', 'dataset_id', 'item_id']).references(['company_id', 'dataset_id', 'id']).inTable('records');
    t.unique(['document_id', 'external_line_id']);
  });
  await k.raw('ALTER TABLE document_lines ADD CONSTRAINT valid_line CHECK (quantity > 0 AND unit_price_minor >= 0 AND line_total_minor >= 0)');
  await k.schema.createTable('inventory_balances', t => {
    t.uuid('company_id').notNullable(); t.text('dataset_id').notNullable(); t.uuid('item_id').notNullable(); t.text('warehouse').notNullable().defaultTo('HQ-STORE'); t.bigInteger('physical').notNullable().defaultTo(0); t.bigInteger('held').notNullable().defaultTo(0);
    t.primary(['company_id', 'dataset_id', 'item_id', 'warehouse']);
    t.foreign(['company_id', 'dataset_id', 'item_id']).references(['company_id', 'dataset_id', 'id']).inTable('records');
  });
  await k.raw('ALTER TABLE inventory_balances ADD CONSTRAINT valid_stock CHECK (physical >= 0 AND held >= 0 AND held <= physical)');
  await k.schema.createTable('posting_events', t => {
    t.uuid('id').primary(); t.uuid('company_id').notNullable(); t.text('dataset_id').notNullable(); t.text('source_event').notNullable(); t.text('kind').notNullable(); t.jsonb('result').notNullable(); t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(k.fn.now());
    t.foreign(['company_id', 'dataset_id']).references(['company_id', 'id']).inTable('datasets'); t.unique(['company_id', 'dataset_id', 'source_event', 'kind']);
  });
  await k.schema.createTable('activity_log', t => {
    t.bigIncrements('id'); t.uuid('company_id').notNullable(); t.text('dataset_id').notNullable(); t.uuid('record_id'); t.text('action').notNullable(); t.text('actor').notNullable(); t.text('description').notNullable(); t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(k.fn.now());
    t.foreign(['company_id', 'dataset_id']).references(['company_id', 'id']).inTable('datasets'); t.index(['company_id', 'dataset_id', 'record_id']);
  });
  await k.schema.createTable('import_batches', t => {
    t.uuid('id').primary(); t.uuid('company_id').notNullable(); t.text('dataset_id').notNullable(); t.text('resource').notNullable(); t.text('filename').notNullable(); t.text('file_hash').notNullable(); t.jsonb('mapping').notNullable(); t.text('status').notNullable().defaultTo('PREVIEWED');
    t.integer('row_count').notNullable(); t.integer('document_count').notNullable(); t.integer('error_count').notNullable(); t.integer('warning_count').notNullable(); t.integer('cursor').notNullable().defaultTo(0); t.integer('imported').notNullable().defaultTo(0); t.integer('skipped').notNullable().defaultTo(0);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(k.fn.now());
    t.foreign(['company_id', 'dataset_id']).references(['company_id', 'id']).inTable('datasets'); t.index(['company_id', 'dataset_id', 'created_at']);
  });
  await k.schema.createTable('import_documents', t => {
    t.uuid('batch_id').notNullable().references('id').inTable('import_batches'); t.integer('position').notNullable(); t.text('external_id').notNullable(); t.jsonb('rows').notNullable(); t.jsonb('normalized'); t.jsonb('issues').notNullable(); t.text('outcome').notNullable().defaultTo('PENDING'); t.uuid('record_id');
    t.primary(['batch_id', 'position']); t.index(['batch_id', 'outcome']);
  });
  await k.schema.createTable('auth_attempts', t => { t.text('fingerprint').primary(); t.integer('failures').notNullable().defaultTo(0); t.timestamp('window_start', { useTz: true }).notNullable().defaultTo(k.fn.now()); });
};
// Expand-only releases: rollback application code, do not drop persisted records.
exports.down = async function () { throw new Error('Forward-only migration: restore an isolated backup instead of dropping ERP data.'); };
