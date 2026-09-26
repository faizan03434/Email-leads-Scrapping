import {permissionError} from './permissions';
export {canManage} from './permissions';
import {headers} from 'next/headers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {env} from 'cloudflare:workers';
import type {Membership,Role} from './types';
export class AccessError extends Error{constructor(public status:number,message:string){super(message);}}
export async function access(){
 const user=await getChatGPTUser();if(!user)throw new AccessError(401,'Sign in to access your workspace.');if(!env.DB)throw new AccessError(503,'Workspace database unavailable');
 const email=user.email.toLowerCase();const createdAt=new Date().toISOString();
 await env.DB.prepare("INSERT INTO memberships (id,workspaceId,userId,email,name,role,status,createdAt) VALUES (?,?,?,?,?,'owner','Active',?) ON CONFLICT(workspaceId,email) DO NOTHING").bind(crypto.randomUUID(),user.userId,user.userId,email,user.displayName,createdAt).run();
 const results=await env.DB.prepare("SELECT * FROM memberships WHERE (userId=? OR (userId IS NULL AND email=?)) AND status='Active'").bind(user.userId,email).all<Membership>();
 const h=await headers();const selected=h.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('leadflow-workspace='))?.slice(19);
 const membership=results.results.find(m=>m.workspaceId===selected)||results.results.find(m=>m.workspaceId===user.userId);
 if(!membership)throw new AccessError(403,'Workspace membership is inactive.');
 if(!membership.userId)await env.DB.prepare('UPDATE memberships SET userId=?,name=? WHERE id=? AND userId IS NULL AND email=?').bind(user.userId,user.displayName,membership.id,email).run();
 return {workspaceId:membership.workspaceId,userId:user.userId,email,role:membership.role,workspaces:results.results};
}
export function authorize(role:Role,action:string){const message=permissionError(role,action);if(message)throw new AccessError(403,message);}
