import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/history/northwind/customers');
export default async function Page({searchParams}){return workspacePage('/history/northwind/customers',await searchParams);}
