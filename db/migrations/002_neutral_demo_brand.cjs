exports.up = async function (db) {
  await db('companies').where({ id: '00000000-0000-4000-8000-000000000001', name: 'Ahsan Composite Ltd.' }).update({ name: 'Demo Garments Ltd.' });
};
exports.down = async function () { throw new Error('Forward-only migration.'); };
