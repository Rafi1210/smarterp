const fs = require('node:fs');
const path = require('node:path');
const envFile = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
