import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/order-control');
export default async function Page({searchParams}){return workspacePage('/order-control',await searchParams);}
