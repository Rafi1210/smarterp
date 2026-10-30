exports.up=async function(k){
 await k.schema.createTable('approval_requests',t=>{
  t.uuid('id').primary();t.uuid('company_id').notNullable();t.text('dataset_id').notNullable();t.uuid('document_id').notNullable();
  t.text('external_id').notNullable();t.text('resource').notNullable();t.text('status').notNullable().defaultTo('Pending');
  t.text('fingerprint').notNullable();t.uuid('client_key').notNullable();t.text('request_hash').notNullable();t.text('submit_note').notNullable().defaultTo('');
  t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now());t.timestamp('decided_at',{useTz:true});
  t.foreign(['company_id','dataset_id','document_id']).references(['company_id','dataset_id','id']).inTable('records');
  t.unique(['company_id','dataset_id','id']);t.unique(['company_id','dataset_id','external_id']);t.unique(['company_id','dataset_id','client_key']);
  t.index(['company_id','dataset_id','status','created_at']);
 });
 await k.raw("ALTER TABLE approval_requests ADD CONSTRAINT valid_approval_request CHECK(status IN ('Pending','Approved','Returned','Cancelled') AND resource IN ('purchases','merchandising','bom','payroll'))");
 await k.raw("CREATE UNIQUE INDEX one_pending_review ON approval_requests(company_id,dataset_id,document_id) WHERE status='Pending'");
 await k.schema.createTable('approval_decisions',t=>{
  t.uuid('id').primary();t.uuid('company_id').notNullable();t.text('dataset_id').notNullable();t.uuid('request_id').notNullable();
  t.text('decision').notNullable();t.text('reason').notNullable().defaultTo('');t.text('request_hash').notNullable();t.text('actor').notNullable().defaultTo('local-review');
  t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
  t.foreign(['company_id','dataset_id','request_id']).references(['company_id','dataset_id','id']).inTable('approval_requests');
  t.unique(['company_id','dataset_id','request_id']);
 });
 await k.raw("ALTER TABLE approval_decisions ADD CONSTRAINT valid_review_decision CHECK(decision IN ('Approved','Returned','Cancelled'))");
 await k.schema.createTable('planning_task_dependencies',t=>{
  t.uuid('company_id').notNullable();t.text('dataset_id').notNullable();t.uuid('task_id').notNullable();t.uuid('prerequisite_id').notNullable();
  t.primary(['company_id','dataset_id','task_id']);
  for(const key of ['task_id','prerequisite_id'])t.foreign(['company_id','dataset_id',key]).references(['company_id','dataset_id','id']).inTable('records');
  t.index(['company_id','dataset_id','prerequisite_id']);
 });
 await k.raw('ALTER TABLE planning_task_dependencies ADD CONSTRAINT no_self_dependency CHECK(task_id <> prerequisite_id)');
};
exports.down=async()=>{throw Error('Forward-only migration. Preserve review and planning history.');};
