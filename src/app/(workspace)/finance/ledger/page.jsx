import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/finance/ledger');
export default async function Page({searchParams}){return workspacePage('/finance/ledger',await searchParams);}
