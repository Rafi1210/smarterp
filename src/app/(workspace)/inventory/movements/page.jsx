import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/inventory/movements');
export default async function Page({searchParams}){return workspacePage('/inventory/movements',await searchParams);}
