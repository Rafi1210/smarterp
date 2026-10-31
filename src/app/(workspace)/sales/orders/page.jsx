import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/sales/orders');
export default async function Page({searchParams}){return workspacePage('/sales/orders',await searchParams);}
