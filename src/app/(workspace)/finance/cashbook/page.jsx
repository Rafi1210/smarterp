import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/finance/cashbook');
export default async function Page({searchParams}){return workspacePage('/finance/cashbook',await searchParams);}
