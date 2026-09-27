import {createClient} from '@supabase/supabase-js';
import {getConfiguration} from '@/lib/setup/store';
export async function storageClient(){const config=await getConfiguration();const url=config.NEXT_PUBLIC_SUPABASE_URL,key=config.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Supabase storage is not configured');return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('resumes');}
