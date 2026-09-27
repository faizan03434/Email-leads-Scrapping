import Link from 'next/link';
import SetupPanel from '@/app/setup-panel';
export const dynamic='force-dynamic';
export default async function Setup(){return <main className="setup-page"><Link className="text-button" href="/">? Back to workspace</Link><div className="page-heading"><div><div className="eyebrow">LEADFLOW</div><h1>Setup & connections</h1><p>Manage your providers and Supabase connection.</p></div></div><SetupPanel/></main>;}
