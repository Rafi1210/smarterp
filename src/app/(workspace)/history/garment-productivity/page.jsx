import {workspacePage,workspaceMetadata} from '@/lib/workspace-page';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata=workspaceMetadata('/history/garment-productivity');
export default async function Page({searchParams}){return workspacePage('/history/garment-productivity',await searchParams);}
