// This route runs in Node.js (not Cloudflare Worker) — it uses nodemailer for Gmail SMTP.
// The 'nodejs' runtime directive tells the framework to use Node.js for this route only.
export const runtime = 'nodejs';

import {equal,runtime as cfRuntime,failure,HttpError} from '@/lib/server';
import nodemailer from 'nodemailer';

export async function POST(req:Request){
 try{
  const secret=cfRuntime().UNSUBSCRIBE_SECRET;
  if(!secret||!equal(req.headers.get('x-smtp-secret')||'',secret))
   throw new HttpError(401,'Unauthorized');

  const body=await req.json() as {
   from:string;replyTo:string;to:string;subject:string;text:string;
   deliveryId:string;gmailUser:string;gmailPass:string;
  };

  if(!body.to||!body.subject||!body.gmailUser||!body.gmailPass)
   throw new HttpError(400,'Missing required fields');

  const transporter=nodemailer.createTransport({
   host:'smtp.gmail.com',
   port:587,
   secure:false,
   auth:{user:body.gmailUser,pass:body.gmailPass},
   connectionTimeout:10000,
   greetingTimeout:10000,
  });

  const info=await transporter.sendMail({
   from:body.from,
   replyTo:body.replyTo||body.gmailUser,
   to:body.to,
   subject:body.subject,
   text:body.text,
   headers:{'X-Leadflow-Delivery':body.deliveryId},
  });

  return Response.json({ok:true,messageId:info.messageId||body.deliveryId});
 }catch(e){return failure(e);}
}
