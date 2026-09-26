import {z} from 'zod';
import {STATES,EMPTY_LEAD} from './domain.ts';

export const searchCriteria=z.object({industry:z.string().min(1).max(300),state:z.enum(STATES as [string,...string[]]),city:z.string().max(300).default(''),query:z.string().max(300).default(''),type:z.enum(['Prospect','Insurance consumer','Insurance agent / agency','Property owner','Candidate','Business','Job opening']),limit:z.number().int().min(1).max(10000),provider:z.enum(['licensed','rentcast','adzuna'])});
export type Criteria=z.infer<typeof searchCriteria>;
export type ProviderEnv=Record<string,string|undefined>;
export type ProviderPage={leads:Record<string,unknown>[];nextCursor:string;exhausted:boolean};

const codes='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
export const stateCode=(state:string)=>codes[STATES.indexOf(state)];

export function availableProviders(e:ProviderEnv){return[
 {id:'licensed',name:'Licensed contacts API',configured:!!(e.LEAD_API_KEY&&e.LEAD_API_URL),types:['Prospect','Insurance consumer','Insurance agent / agency','Candidate','Business'],description:'Your licensed contacts or authorized ATS adapter. No assumed candidate access.',credentials:['LEAD_API_URL','LEAD_API_KEY']},
 {id:'rentcast',name:'RentCast property records',configured:!!e.RENTCAST_API_KEY,types:['Property owner'],description:'US property owners, addresses and property data. Does not provide email or insurance purchase intent.',credentials:['RENTCAST_API_KEY']},
 {id:'adzuna',name:'Adzuna job openings',configured:!!(e.ADZUNA_APP_ID&&e.ADZUNA_APP_KEY),types:['Job opening'],description:'Job advertisements and employer hiring signals. Does not return candidates or resumes.',credentials:['ADZUNA_APP_ID','ADZUNA_APP_KEY']}
];}

export class ProviderError extends Error{retryable:boolean;retryAfter:number;constructor(message:string,retryable=false,retryAfter=60){super(message);this.retryable=retryable;this.retryAfter=retryAfter;}}

const strings=z.string().optional().nullable();
const property=z.object({id:strings,addressLine1:strings,formattedAddress:strings,city:strings,state:strings,zipCode:strings,propertyType:strings,owner:z.object({names:z.array(z.string()).optional()}).optional().nullable()});
export function mapProperties(raw:unknown,criteria:Criteria){
 return z.array(property).parse(raw).filter(p=>p.id||p.formattedAddress||p.addressLine1).map(p=>({...EMPTY_LEAD,name:p.owner?.names?.[0]||'Property owner',email:'',industry:criteria.industry,type:'Property owner',state:STATES[codes.indexOf(p.state||'')]||p.state||'',city:p.city||'',address:p.addressLine1||p.formattedAddress||'',zip:p.zipCode||'',source:'RentCast',sourceRef:p.id||p.formattedAddress||`${p.addressLine1}|${p.city}|${p.state}|${p.zipCode}`,permission:'Unknown',notes:`Property type: ${p.propertyType||'Not supplied'}. Property ownership does not indicate insurance interest or outreach permission.`}));
}

const job=z.object({id:z.union([z.string(),z.number()]),title:z.string(),description:z.string().optional(),redirect_url:z.string().url(),company:z.object({display_name:strings}).optional(),location:z.object({display_name:strings,area:z.array(z.string()).optional()}).optional()});
export function mapJobs(raw:unknown,criteria:Criteria){
 return z.array(job).parse(raw).map(p=>{const location=p.location?.area||[];const state=location.find(s=>STATES.includes(s))||'';return{...EMPTY_LEAD,name:p.title,jobTitle:p.title,company:p.company?.display_name||'',industry:criteria.industry,type:'Job opening',email:'',state,city:p.location?.display_name||'',source:'Adzuna',sourceRef:String(p.id),sourceUrl:p.redirect_url,permission:'Unknown',notes:(p.description||'').slice(0,10000)};});
}

export async function fetchProviderPage(e:ProviderEnv,criteria:Criteria,cursor:string,remaining:number,fetcher:typeof fetch=fetch):Promise<ProviderPage>{
 const provider=availableProviders(e).find(p=>p.id===criteria.provider);
 if(!provider?.configured)throw new ProviderError('Configure this provider before creating a search.');
 if(!provider.types.includes(criteria.type))throw new ProviderError('This provider does not supply the selected lead type.');
 const count=criteria.provider==='adzuna'?50:Math.min(50,remaining);

 let url:URL;
 const init:RequestInit={signal:AbortSignal.timeout(20000)};

 if(criteria.provider==='rentcast'){
  url=new URL('https://api.rentcast.io/v1/properties');
  url.search=new URLSearchParams({state:stateCode(criteria.state),...(criteria.city?{city:criteria.city}:{}),limit:String(count),offset:cursor||'0'}).toString();
  init.headers={'X-Api-Key':e.RENTCAST_API_KEY!,Accept:'application/json'};
 } else if(criteria.provider==='adzuna'){
  url=new URL(`https://api.adzuna.com/v1/api/jobs/us/search/${Number(cursor)||1}`);
  url.search=new URLSearchParams({app_id:e.ADZUNA_APP_ID!,app_key:e.ADZUNA_APP_KEY!,results_per_page:String(count),where:[criteria.city,criteria.state].filter(Boolean).join(', '),what:criteria.query,'content-type':'application/json'}).toString();
 } else {
  url=new URL(e.LEAD_API_URL!);
  if(url.protocol!=='https:')throw new ProviderError('Licensed provider must use HTTPS.');
  init.method='POST';
  init.headers={Authorization:`Bearer ${e.LEAD_API_KEY}`,'Content-Type':'application/json'};
  init.body=JSON.stringify({...criteria,limit:count,cursor:cursor||undefined});
 }

 let response:Response;
 try{
  response=await fetcher(url,init);
 }catch(err:unknown){
  const isTimeout=err instanceof Error&&(err.name==='TimeoutError'||err.name==='AbortError');
  // retryable=false so it goes to Failed immediately, not infinite Retrying loop
  throw new ProviderError(
   isTimeout
    ?'Request timed out after 20 s. Check internet connection and retry.'
    :`Connection failed: ${err instanceof Error?err.message:'unknown error'}. Check internet connection and retry.`,
   false
  );
 }

 if(!response.ok){
  const retry=response.status===429||response.status>=500;
  const header=response.headers.get('retry-after');
  const seconds=header&&/^\d+$/.test(header)?Number(header):60;
  throw new ProviderError(
   `Provider returned HTTP ${response.status}. ${response.status===401||response.status===403?'Verify your API key and subscription.':'Try again after the provider recovers.'}`,
   retry,Math.max(1,Math.min(3600,seconds))
  );
 }

 const raw:unknown=await response.json();

 if(criteria.provider==='rentcast'){
  const rows=mapProperties(raw,criteria);
  return{leads:rows,nextCursor:String((Number(cursor)||0)+(Array.isArray(raw)?raw.length:0)),exhausted:!Array.isArray(raw)||raw.length<count};
 }
 if(criteria.provider==='adzuna'){
  const parsed=z.object({results:z.array(z.unknown()),count:z.number().optional()}).parse(raw);
  const page=Number(cursor)||1;
  return{leads:mapJobs(parsed.results,criteria).slice(0,remaining),nextCursor:String(page+1),exhausted:parsed.results.length<count||(parsed.count!==undefined&&page*count>=parsed.count)};
 }
 const parsed=z.object({leads:z.array(z.record(z.unknown())).max(50),nextCursor:z.string().optional()}).parse(raw);
 return{leads:parsed.leads.map(l=>({...l,industry:criteria.industry,type:l.type||criteria.type,source:l.source||'Licensed API'})),nextCursor:parsed.nextCursor||'',exhausted:!parsed.nextCursor||parsed.leads.length===0};
}
