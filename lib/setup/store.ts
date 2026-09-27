import {AsyncLocalStorage} from 'node:async_hooks';
import {controlDatabase} from '@/db/control';
import {encrypt,decrypt} from './security';
export type Configuration=Record<string,string|undefined>;
const scope=new AsyncLocalStorage<{configuration?:Promise<Configuration>}>();
export function withConfiguration<T>(callback:()=>Promise<T>){return scope.run({},callback);}
export async function readSetting<T>(name:string):Promise<T|null>{const rows=await controlDatabase()`SELECT payload FROM public.app_configuration WHERE name=${name}`;return rows[0]?decrypt<T>(rows[0].payload,name):null;}
export async function writeSetting(name:string,value:unknown){await controlDatabase()`INSERT INTO public.app_configuration (name,payload) VALUES (${name},${encrypt(value,name)}) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload,updated_at=now()`;}
async function loadConfiguration():Promise<Configuration>{const saved=await readSetting<Configuration>('integrations')||{};const env={...process.env,...saved};return {...env,SCHEDULER_SECRET:Object.hasOwn(saved,'CRON_SECRET')?saved.CRON_SECRET:env.CRON_SECRET||env.SCHEDULER_SECRET};}
export function getConfiguration(){const current=scope.getStore();if(!current)return loadConfiguration();return current.configuration??=loadConfiguration();}
