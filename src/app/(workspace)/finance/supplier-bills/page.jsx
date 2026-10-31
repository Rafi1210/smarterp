import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/finance/supplier-bills');
export default async function Page({searchParams}){return workspacePage('/finance/supplier-bills',await searchParams);}
