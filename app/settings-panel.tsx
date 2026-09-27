'use client';
import {Database,History,Settings2} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import type {WorkspaceData} from '@/lib/types';
import SetupPanel from '@/app/setup-panel';
type Props={data:WorkspaceData;busy:boolean;mutate:(action:string,payload:Record<string,unknown>,message:string)=>void;children:React.ReactNode};
export default function SettingsPanel({data,children}:Props){
 const admin=['owner','admin'].includes(data.access.role);
 return <Tabs defaultValue="general" className="settings-tabs"><TabsList><TabsTrigger value="general"><Settings2 size={15}/>General</TabsTrigger><TabsTrigger value="sources"><Database size={15}/>Setup & connections</TabsTrigger><TabsTrigger value="audit"><History size={15}/>Audit history</TabsTrigger></TabsList>
 <TabsContent value="general">{children}</TabsContent>
 <TabsContent value="sources"><SetupPanel/></TabsContent>
 <TabsContent value="audit"><section className="content-card"><h2>Audit history</h2><p>Latest 200 recorded workspace actions. Audit records are read-only in the application and do not contain API keys or message bodies.</p>{admin?<><Table><TableHeader><TableRow><TableHead>TIME</TableHead><TableHead>USER</TableHead><TableHead>ACTION</TableHead><TableHead>DETAILS</TableHead></TableRow></TableHeader><TableBody>{data.audit.map(a=><TableRow key={a.id}><TableCell>{new Date(a.createdAt).toLocaleString()}</TableCell><TableCell>{a.actorEmail}</TableCell><TableCell>{a.action}</TableCell><TableCell>{a.summary}</TableCell></TableRow>)}</TableBody></Table>{!data.audit.length&&<p>No recorded actions yet.</p>}</>:<div className="notice">Audit history is available to administrators.</div>}</section></TabsContent>
 </Tabs>;
}
