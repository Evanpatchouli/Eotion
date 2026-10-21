const { createRequire } = require('node:module');
const requireApi = createRequire('C:/Users/31250/Work/Eotion/apps/api/package.json');
const { MongoClient } = requireApi('mongoose').mongo;
(async () => {
 const client = new MongoClient('mongodb://127.0.0.1:55479/?directConnection=true', {serverSelectionTimeoutMS: 15000});
 await client.connect();
 if (process.argv[2] === 'shutdown') {
   try { await client.db('admin').command({shutdown: 1}); } catch(error) { console.log('shutdown disconnect:', error.message); }
 } else {
   console.log(JSON.stringify(await client.db('admin').command({replSetInitiate: {_id:'p116_dfbb4269', members:[{_id:0,host:'127.0.0.1:55479'}]}})));
   let hello;
   for(let i=0;i<100;i++) { hello=await client.db('admin').command({hello:1}); if(hello.isWritablePrimary)break; await new Promise(r=>setTimeout(r,100)); }
   if (!hello.isWritablePrimary) throw Error('replica set did not become primary');
   console.log(JSON.stringify(hello));
 }
 await client.close();
})().catch(e=>{console.error(e);process.exitCode=1});
