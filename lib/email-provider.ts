import {runtime,HttpError} from './server';
export type EmailMessage={deliveryId:string;to:string;senderName:string;senderEmail:string;replyTo:string;subject:string;text:string;unsubscribeUrl:string};
export type DeliveryResult={accepted:boolean;providerId?:string;error?:string};
// Provider boundary: Gmail SMTP and SendGrid both implement this interface.
export interface EmailProvider{send(message:EmailMessage):Promise<DeliveryResult>}

// ── SendGrid HTTP provider ────────────────────────────────────────────────────
export const sendGridProvider:EmailProvider={async send(m){
 const key=runtime().SENDGRID_API_KEY;if(!key)throw new HttpError(409,'SendGrid API key is not configured.');
 const inboundDomain=runtime().INBOUND_REPLY_DOMAIN;
 if(inboundDomain&&!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(inboundDomain))throw new HttpError(503,'Invalid inbound reply domain');
 if(inboundDomain)m={...m,replyTo:`reply+${m.deliveryId}@${inboundDomain.toLowerCase()}`};
 const response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({personalizations:[{to:[{email:m.to}],custom_args:{leadflow_delivery_id:m.deliveryId}}],from:{email:m.senderEmail,name:m.senderName},reply_to:{email:m.replyTo},subject:m.subject,content:[{type:'text/plain',value:m.text}],headers:{'List-Unsubscribe':`<${m.unsubscribeUrl}>`},tracking_settings:{click_tracking:{enable:false,enable_text:false},open_tracking:{enable:false}}}),signal:AbortSignal.timeout(8000)});
 if(response.status!==202)return{accepted:false,error:`SendGrid returned ${response.status}. Review before retrying.`};
 return{accepted:true,providerId:response.headers.get('x-message-id')||m.deliveryId};
}};

// ── Gmail SMTP provider ───────────────────────────────────────────────────────
// Cloudflare Workers cannot open TCP sockets directly, so Gmail SMTP goes
// through /api/smtp-relay which runs in Node.js runtime.
export const gmailSmtpProvider:EmailProvider={async send(m){
 const user=runtime().GMAIL_USER;
 const pass=runtime().GMAIL_APP_PASSWORD;
 const secret=runtime().UNSUBSCRIBE_SECRET;
 if(!user||!pass)throw new HttpError(409,'Gmail credentials not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.');
 if(!secret)throw new HttpError(409,'UNSUBSCRIBE_SECRET not configured.');
 // Call the Node.js smtp-relay endpoint — runs on same host, bypasses Worker TCP restriction
 const relayUrl='http://127.0.0.1:5173/api/smtp-relay';
 let response:Response;
 try{
  response=await fetch(relayUrl,{
   method:'POST',
   headers:{'Content-Type':'application/json','x-smtp-secret':secret},
   body:JSON.stringify({
    from:`"${m.senderName}" <${user}>`,
    replyTo:m.replyTo||user,
    to:m.to,
    subject:m.subject,
    text:m.text,
    deliveryId:m.deliveryId,
    gmailUser:user,
    gmailPass:pass,
   }),
   signal:AbortSignal.timeout(20000),
  });
 }catch(err){
  throw new Error(`SMTP relay unreachable: ${err instanceof Error?err.message:String(err)}`);
 }
 if(!response.ok){
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j=await response.json().catch(():any=>({}));
  return{accepted:false,error:`SMTP relay error ${response.status}: ${j?.error||'unknown'}`};
 }
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const j=await response.json() as any;
 return{accepted:true,providerId:j.messageId||m.deliveryId};
}};

// ── Auto-select provider based on configured credentials ─────────────────────
export function activeEmailProvider():EmailProvider{
 const e=runtime();
 if(e.SENDGRID_API_KEY)return sendGridProvider;
 if(e.GMAIL_USER&&e.GMAIL_APP_PASSWORD)return gmailSmtpProvider;
 throw new HttpError(409,'No email provider configured. Set SENDGRID_API_KEY or GMAIL_USER + GMAIL_APP_PASSWORD.');
}
