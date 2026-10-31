import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/finance/invoices');
export default async function Page({searchParams}){return workspacePage('/finance/invoices',await searchParams);}
