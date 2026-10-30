import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
const db=await PGlite.create('.local-db');const server=new PGLiteSocketServer({db,host:'127.0.0.1',port:5439});await server.start();console.log('Local development database listening on 127.0.0.1:5439 (not a Neon deployment).');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await server.stop();await db.close();process.exit(0)});
