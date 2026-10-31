import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/merchandising/order-sheets');
export default async function Page({searchParams}){return workspacePage('/merchandising/order-sheets',await searchParams);}
