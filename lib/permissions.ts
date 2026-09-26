export type WorkspaceRole='owner'|'admin'|'member'|'viewer';
export function canManage(role:WorkspaceRole){return role==='owner'||role==='admin';}
export function permissionError(role:WorkspaceRole,action:string){
 if(['list','export','jobStatus','auditHistory','switchWorkspace'].includes(action))return null;
 if(role==='viewer')return 'This workspace is read-only for your account.';
 if(['saveSettings','addIndustry','saveMember','disableMember'].includes(action)&&!canManage(role))return 'Administrator access is required.';
 return null;
}
