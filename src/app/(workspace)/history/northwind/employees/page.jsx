import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/history/northwind/employees');
export default async function Page({searchParams}){return workspacePage('/history/northwind/employees',await searchParams);}
