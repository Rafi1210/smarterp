import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/purchases/bills');
export default async function Page({searchParams}){return workspacePage('/purchases/bills',await searchParams);}
