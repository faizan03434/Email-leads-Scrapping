import postgres from 'postgres';
import {compileSql,createDatabase,type Executor} from './adapter';
import {getConfiguration} from '@/lib/setup/store';
const clients=new Map<string,ReturnType<typeof postgres>>();
async function connection(){const config=await getConfiguration();const url=config.DATABASE_URL;if(!url)throw new Error('Database is not configured');let client=clients.get(url);if(!client){client=postgres(url,{prepare:false,max:3,idle_timeout:20,connect_timeout:10,ssl:process.env.DATABASE_SSL==='false'?false:'require',types:{bigint:{to:20,from:[20],serialize:String,parse:Number}}});clients.set(url,client);if(clients.size>4){const oldest=clients.keys().next().value;if(oldest&&oldest!==url){const old=clients.get(oldest);clients.delete(oldest);void old?.end({timeout:30});}}}return client;}
const execute:Executor=async(sql,values)=>{const rows=await (await connection()).unsafe(sql,values as never[]);return{rows,count:rows.count};};
const adapter=createDatabase(execute,async statements=>(await connection()).begin(async tx=>{const results=[];for(const s of statements){const rows=await tx.unsafe(compileSql(s.sql),s.values as never[]);results.push({results:[...rows],meta:{changes:rows.count}});}return results;}));
export const database=()=>adapter;
