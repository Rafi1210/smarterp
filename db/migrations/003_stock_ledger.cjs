exports.up=async function(k){
 await k.schema.createTable('stock_movements',t=>{
  t.uuid('id').primary();t.uuid('company_id').notNullable();t.text('dataset_id').notNullable();t.uuid('item_id').notNullable();t.uuid('source_id').notNullable();t.uuid('event_id').notNullable().references('id').inTable('posting_events');t.text('warehouse').notNullable().defaultTo('HQ-STORE');t.text('kind').notNullable();t.bigInteger('quantity_delta').notNullable();t.bigInteger('held_delta').notNullable();t.bigInteger('physical_after').notNullable();t.bigInteger('held_after').notNullable();t.date('business_date').notNullable();t.timestamp('created_at',{useTz:true}).defaultTo(k.fn.now());
  for(const key of ['id','item_id','source_id'])t.foreign(['company_id','dataset_id',key]).references(['company_id','dataset_id','id']).inTable('records');
  t.unique(['event_id','item_id']);t.index(['company_id','dataset_id','item_id','business_date']);
 });
 await k.raw('ALTER TABLE stock_movements ADD CONSTRAINT valid_movement_balance CHECK (physical_after >= 0 AND held_after >= 0 AND held_after <= physical_after)');
};exports.down=async()=>{throw Error('Forward-only migration.');};
