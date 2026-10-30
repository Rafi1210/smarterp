import {requirePageUser} from '@/lib/server-auth';import Workspace from '@/components/workspace';
export const runtime='nodejs';export const dynamic='force-dynamic';
export default async function Home(){const user=await requirePageUser();return <Workspace user={{id:user.id,email:user.email,display_name:user.display_name,role:user.role}}/>;}
