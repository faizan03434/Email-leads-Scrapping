import {permissionError} from './permissions';
export {canManage} from './permissions';
import {controlDatabase} from '@/db/control';
import {encrypt,decrypt} from '@/lib/setup/security';
import type {Membership,Role} from './types';
export class AccessError extends Error{constructor(public status:number,message:string){super(message);}}
// One durable workspace for every visitor. No cookie or request header selects ownership.
export async function access(){
 const sql=controlDatabase();
 let [saved]=await sql`SELECT payload FROM public.app_configuration WHERE name='sharedWorkspace'`;
 if(!saved){
  // Preserve records created before login was removed, without retaining authentication.
  const [legacy]=await sql`SELECT payload FROM public.app_configuration WHERE name='admin'`;
  const previous=legacy?decrypt<{id:string}>(legacy.payload,'admin').id:null;
  const id=previous||'00000000-0000-4000-8000-000000000001';
  await sql`INSERT INTO public.app_configuration (name,payload) VALUES ('sharedWorkspace',${encrypt({id},'sharedWorkspace')}) ON CONFLICT(name) DO NOTHING`;
  [saved]=await sql`SELECT payload FROM public.app_configuration WHERE name='sharedWorkspace'`;
 }
 const {id}=decrypt<{id:string}>(saved.payload,'sharedWorkspace');
 const member:Membership={id,workspaceId:id,userId:id,email:'shared-workspace',name:'Client workspace',role:'owner',status:'Active',createdAt:''};
 return{workspaceId:id,userId:id,email:member.email,role:'owner' as Role,workspaces:[member]};
}
export function authorize(role:Role,action:string){const message=permissionError(role,action);if(message)throw new AccessError(403,message);}
