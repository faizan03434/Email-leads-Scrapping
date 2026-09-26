import fs from 'node:fs';
const edit=(p,fn)=>fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));
edit('app/api/resume/route.ts',s=>s.replace('runtime().BUCKET as R2Bucket','env.BUCKET'));
edit('lib/outreach.ts',s=>s.replaceAll('.first<any>()','.first<{n:number}>()').replace('${remaining.n}','${remaining?.n||0}'));
edit('app/workspace.tsx',s=>s.replace(',SlidersHorizontal','').replace("import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';\n",'').replace('const j:any=await r.json()','const j=await r.json() as {error:string;key:string}'));
edit('app/search-jobs-panel.tsx',s=>s.replace("import {Play", "import {useState,useEffect} from 'react';\nimport {Play").replace(' return <div',' const [clock,setClock]=useState(()=>Date.now());useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);\n return <div').replaceAll('>Date.now()','>clock'));
