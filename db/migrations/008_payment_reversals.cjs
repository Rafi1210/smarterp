exports.up = async function (k) {
  // Original cash entries and allocations remain immutable. A correction is a
  // separate, scoped voucher, not deletion or a negative original allocation.
  await k.schema.createTable('payment_reversals', t => {
    t.uuid('id').primary();
    t.uuid('company_id').notNullable(); t.text('dataset_id').notNullable();
    t.uuid('payment_id').notNullable(); t.uuid('target_id').notNullable();
    t.uuid('original_cash_id').notNullable(); t.uuid('cash_record_id').notNullable();
    t.uuid('journal_id').notNullable(); t.uuid('event_id').notNullable();
    t.bigInteger('amount_minor').notNullable(); t.date('business_date').notNullable();
    t.text('reason').notNullable(); t.timestamp('created_at', {useTz: true}).notNullable().defaultTo(k.fn.now());
    for (const field of ['payment_id', 'target_id', 'cash_record_id', 'journal_id']) {
      t.foreign(['company_id', 'dataset_id', field]).references(['company_id', 'dataset_id', 'id']).inTable('records');
    }
    t.foreign(['company_id', 'dataset_id', 'original_cash_id']).references(['company_id', 'dataset_id', 'id']).inTable('cash_entries');
    t.foreign(['company_id', 'dataset_id', 'event_id']).references(['company_id', 'dataset_id', 'id']).inTable('posting_events');
    t.unique(['company_id', 'dataset_id', 'payment_id']);
    t.unique(['company_id', 'dataset_id', 'cash_record_id']);
    t.index(['company_id', 'dataset_id', 'business_date']);
    t.index(['company_id', 'dataset_id', 'target_id']);
  });
  await k.raw('ALTER TABLE payment_reversals ADD CONSTRAINT positive_reversal CHECK (amount_minor > 0 AND length(btrim(reason)) BETWEEN 6 AND 500)');
};
exports.down = async () => { throw Error('Forward-only migration; preserve reversal history.'); };
