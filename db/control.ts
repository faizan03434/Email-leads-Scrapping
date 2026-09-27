import postgres from 'postgres';
let client:ReturnType<typeof postgres>|undefined;
export function controlDatabase(){
 const url=process.env.CONFIG_DATABASE_URL||process.env.DATABASE_URL;
 if(!url)throw new Error('Initial configuration database is missing');
 return client??=postgres(url,{prepare:false,max:3,connect_timeout:10,idle_timeout:20,ssl:process.env.DATABASE_SSL==='false'?false:'require'});
}
