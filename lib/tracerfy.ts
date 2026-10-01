import {z} from 'zod';
import {STATES} from './domain.ts';
const codes='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const clean=(value:unknown)=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
export function traceState(state:string){return codes[STATES.indexOf(state)]||state.toUpperCase();}
export function traceIdentity(row:{address:unknown;city:unknown;state:unknown}){return [clean(row.address),clean(row.city),clean(traceState(String(row.state)))].join('|');}
export const traceRow=z.object({address:z.string(),city:z.string(),state:z.string()}).passthrough();
export function traceContact(row:Record<string,unknown>){
 const email=Array.from({length:5},(_,i)=>row[`email_${i+1}`]).find(v=>typeof v==='string'&&z.string().email().safeParse(v.trim()).success);
 const phone=[row.primary_phone,...Array.from({length:5},(_,i)=>row[`mobile_${i+1}`]),...Array.from({length:3},(_,i)=>row[`landline_${i+1}`])].find(v=>typeof v==='string'&&/^[+\d ().-]{7,30}$/.test(v));
 return {email:typeof email==='string'?email.trim().toLowerCase():'',phone:typeof phone==='string'?phone:''};
}
export async function tracerfyRequest(key:string,path:string,body?:unknown,fetcher:typeof fetch=fetch){
 const response=await fetcher('https://tracerfy.com/v1/api/'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(response.status===402?'Tracerfy credits are insufficient. Add credits in your Tracerfy account.':response.status===401||response.status===403?'Tracerfy rejected the API key or account permissions.':response.status===429?'Tracerfy rate limit reached. Wait before checking again.':`Tracerfy returned HTTP ${response.status}.`);
 return response.json() as Promise<unknown>;
}
export function advancedTraceBody(rows:{address:string;city:string;state:string;zip:string}[]){return {trace_type:'advanced',address_column:'address',city_column:'city',state_column:'state',zip_column:'zip',json_data:JSON.stringify(rows.map(row=>({...row,state:traceState(row.state)})))};}
