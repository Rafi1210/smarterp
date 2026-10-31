import {redirect} from 'next/navigation';
import {legacyHref} from '@/lib/workspace-routes';
import {requirePageUser} from '@/lib/server-auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export default async function Home({searchParams}){const target=legacyHref(await searchParams);await requirePageUser(target);redirect(target);}
