import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/history/northwind/sales');
export default async function Page({searchParams}){return workspacePage('/history/northwind/sales',await searchParams);}
