'use client';
import {createClient} from '@supabase/supabase-js';
export async function uploadResume(id:string,file:File):Promise<string>{
 if(!file.size||file.size>5_000_000||!/^.+\.(pdf|docx)$/i.test(file.name))throw new Error('Choose a PDF or DOCX under 5 MB');
 async function request(body:unknown){const response=await fetch('/api/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
 const upload=await request({action:'prepare',id,name:file.name,size:file.size});
 const client=createClient(upload.url,upload.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error}=await client.storage.from('resumes').uploadToSignedUrl(upload.key,upload.token,file,{contentType:'application/octet-stream'});
 if(error)throw new Error('Upload failed. Please retry.');
 const result=await request({action:'complete',id,key:upload.key,expires:upload.expires,proof:upload.proof});return result.key;
}
