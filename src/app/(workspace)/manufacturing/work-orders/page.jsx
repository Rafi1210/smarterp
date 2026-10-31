import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/manufacturing/work-orders');
export default async function Page({searchParams}){return workspacePage('/manufacturing/work-orders',await searchParams);}
