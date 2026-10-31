import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/purchases/receipts');
export default async function Page({searchParams}){return workspacePage('/purchases/receipts',await searchParams);}
