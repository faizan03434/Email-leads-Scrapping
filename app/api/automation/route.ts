import {withConfiguration} from '@/lib/setup/store';
import {db,runtime,equal,failure,HttpError,now} from '@/lib/server';
import {sendCampaign} from '@/lib/outreach';
import {processSearchJob} from '@/lib/search-jobs';
export const maxDuration=300;
export const GET=POST;
async function postHandler(req:Request){try{
 const secret=(await runtime()).CRON_SECRET||(await runtime()).SCHEDULER_SECRET;if(!secret||!equal(req.headers.get('authorization')||'',`Bearer ${secret}`))throw new HttpError(401,'Unauthorized');
 const job=await db().prepare("SELECT id,owner FROM searchJobs WHERE status IN ('Queued','Retrying','Running') AND nextRunAt<=? AND leaseUntil<? ORDER BY updatedAt LIMIT 1").bind(now(),Date.now()).first<{id:string;owner:string}>();
 const search=job?await processSearchJob(job.owner,job.id):null;
 const campaign=await db().prepare("SELECT c.id,c.owner FROM campaigns c WHERE c.status='Active' AND EXISTS(SELECT 1 FROM deliveries d WHERE d.campaignId=c.id AND d.status='Queued') ORDER BY COALESCE((SELECT MAX(sentAt) FROM deliveries d WHERE d.campaignId=c.id),'') LIMIT 1").first<{id:string;owner:string}>();
 const delivery=campaign?await sendCampaign(campaign.owner,campaign.id):null;
 return Response.json({search,delivery,processed:Number(!!job)+Number(!!campaign)});
 }catch(e){return failure(e);}}

export function POST(req:Request){return withConfiguration(()=>postHandler(req));}
