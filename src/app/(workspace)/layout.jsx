import {pageUser} from '@/lib/server-auth';
import Workspace from '@/components/workspace';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export default async function WorkspaceLayout({children}){
 let user;try{user=await pageUser();}catch{return children;}
 const publicUser={id:user.id,email:user.email,display_name:user.display_name,role:user.role};
 return <Workspace user={publicUser}>{children}</Workspace>;
}
