import {runtime,HttpError} from './server';
export type EmailMessage={deliveryId:string;to:string;senderName:string;senderEmail:string;replyTo:string;subject:string;text:string;unsubscribeUrl:string};
export type DeliveryResult={accepted:boolean;providerId?:string;error?:string};
export interface EmailProvider{send(message:EmailMessage):Promise<DeliveryResult>}

// ── SendGrid HTTP provider ────────────────────────────────────────────────────
export const sendGridProvider:EmailProvider={async send(m){
 const key=runtime().SENDGRID_API_KEY;
 if(!key)throw new HttpError(409,'SendGrid API key is not configured. Set SENDGRID_API_KEY.');
 const inboundDomain=runtime().INBOUND_REPLY_DOMAIN;
 if(inboundDomain&&!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(inboundDomain))throw new HttpError(503,'Invalid inbound reply domain');
 if(inboundDomain)m={...m,replyTo:`reply+${m.deliveryId}@${inboundDomain.toLowerCase()}`};
 const response=await fetch('https://api.sendgrid.com/v3/mail/send',{
  method:'POST',
  headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
  body:JSON.stringify({
   personalizations:[{to:[{email:m.to}],custom_args:{leadflow_delivery_id:m.deliveryId}}],
   from:{email:m.senderEmail,name:m.senderName},
   reply_to:{email:m.replyTo},
   subject:m.subject,
   content:[{type:'text/plain',value:m.text}],
   headers:{'List-Unsubscribe':`<${m.unsubscribeUrl}>`},
   tracking_settings:{click_tracking:{enable:false,enable_text:false},open_tracking:{enable:false}},
  }),
  signal:AbortSignal.timeout(8000),
 });
 if(response.status!==202)return{accepted:false,error:`SendGrid returned ${response.status}. Review before retrying.`};
 return{accepted:true,providerId:response.headers.get('x-message-id')||m.deliveryId};
}};

// ── Active provider ───────────────────────────────────────────────────────────
export function activeEmailProvider():EmailProvider{
 const e=runtime();
 if(e.SENDGRID_API_KEY)return sendGridProvider;
 throw new HttpError(409,'No email provider configured. Set SENDGRID_API_KEY.');
}
