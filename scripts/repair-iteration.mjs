import fs from 'node:fs';
let p='app/settings-panel.tsx',s=fs.readFileSync(p,'utf8').replace('{admin?<Table>','{admin?<><Table>');fs.writeFileSync(p,s);
p='lib/providers.ts';s=fs.readFileSync(p,'utf8').replace('const count=Math.min(50,remaining);',"const count=criteria.provider==='adzuna'?50:Math.min(50,remaining);");s=s.replace('leads:mapJobs(parsed.results,criteria),','leads:mapJobs(parsed.results,criteria).slice(0,remaining),');fs.writeFileSync(p,s);
