exports.up=async function(k){
 await k.schema.alterTable('posting_events',t=>t.unique(['company_id','dataset_id','id']));
 await k.schema.createTable('obligations',t=>{
  t.uuid('document_id').primary();t.uuid('company_id').notNullable();t.text('dataset_id').notNullable();t.text('kind').notNullable();t.uuid('counterparty_id').notNullable();t.uuid('source_id').notNullable();t.text('source_key').notNullable();t.bigInteger('principal_minor').notNullable();t.bigInteger('allocated_minor').notNullable().defaultTo(0);t.date('business_date').notNullable();t.date('due_date').notNullable();
  for(const key of ['document_id','counterparty_id','source_id'])t.foreign(['company_id','dataset_id',key]).references(['company_id','dataset_id','id']).inTable('records');
  t.unique(['company_id','dataset_id','kind','source_key']);t.unique(['company_id','dataset_id','document_id']);t.index(['company_id','dataset_id','kind','due_date']);
 });
 await k.raw("ALTER TABLE obligations ADD CONSTRAINT valid_obligation CHECK (kind IN ('AR','AP','PAYROLL') AND principal_minor > 0 AND allocated_minor >= 0 AND allocated_minor <= principal_minor AND due_date >= business_date)");
 await k.schema.createTable('cash_entries',t=>{
  t.uuid('id').primary();t.uuid('company_id').notNullable();t.text('dataset_id').notNullable();t.uuid('payment_id').notNullable().unique();t.uuid('event_id').notNullable();t.text('kind').notNullable();t.text('direction').notNullable();t.text('reference');t.bigInteger('amount_minor').notNullable();t.date('business_date').notNullable();t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
  for(const key of ['id','payment_id'])t.foreign(['company_id','dataset_id',key]).references(['company_id','dataset_id','id']).inTable('records');
  t.foreign(['company_id','dataset_id','event_id']).references(['company_id','dataset_id','id']).inTable('posting_events');t.unique(['company_id','dataset_id','id']);t.unique(['company_id','dataset_id','kind','reference']);t.index(['company_id','dataset_id','business_date']);
 });
 await k.raw("ALTER TABLE cash_entries ADD CONSTRAINT valid_cash CHECK (amount_minor > 0 AND ((kind='CUSTOMER' AND direction='IN') OR (kind IN ('SUPPLIER','SALARY') AND direction='OUT')))");
 await k.schema.createTable('payment_allocations',t=>{
  t.uuid('company_id').notNullable();t.text('dataset_id').notNullable();t.uuid('payment_id').notNullable();t.uuid('target_id').notNullable();t.uuid('cash_id').notNullable();t.bigInteger('amount_minor').notNullable();t.primary(['payment_id','target_id']);
  t.foreign(['company_id','dataset_id','payment_id']).references(['company_id','dataset_id','id']).inTable('records');t.foreign(['company_id','dataset_id','target_id']).references(['company_id','dataset_id','document_id']).inTable('obligations');t.foreign(['company_id','dataset_id','cash_id']).references(['company_id','dataset_id','id']).inTable('cash_entries');t.index(['target_id']);
 });
 await k.raw('ALTER TABLE payment_allocations ADD CONSTRAINT positive_allocation CHECK (amount_minor > 0)');
 await k.schema.createTable('finance_journal_lines',t=>{
  t.uuid('company_id').notNullable();t.text('dataset_id').notNullable();t.uuid('journal_id').notNullable();t.integer('line_no').notNullable();t.text('account').notNullable();t.bigInteger('debit_minor').notNullable().defaultTo(0);t.bigInteger('credit_minor').notNullable().defaultTo(0);t.primary(['journal_id','line_no']);t.foreign(['company_id','dataset_id','journal_id']).references(['company_id','dataset_id','id']).inTable('records');
 });
 await k.raw("ALTER TABLE finance_journal_lines ADD CONSTRAINT valid_finance_leg CHECK (account IN ('AR','AP','Cash','InvoicedSales','SupplierPurchases','PayrollExpense','PayrollPayable') AND ((debit_minor > 0 AND credit_minor=0) OR (credit_minor > 0 AND debit_minor=0)))");
};exports.down=async()=>{throw Error('Forward-only migration; preserve posted financial records.');};
