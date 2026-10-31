import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/finance/payments');
export default async function Page({searchParams}){return workspacePage('/finance/payments',await searchParams);}
