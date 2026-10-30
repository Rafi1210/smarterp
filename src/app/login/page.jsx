import {redirect} from 'next/navigation';import {pageUser,safeReturnTo} from '@/lib/server-auth';import LoginForm from '@/components/login-form';
export const dynamic='force-dynamic';
export default async function LoginPage({searchParams}){const p=await searchParams,target=safeReturnTo(p.returnTo);let signedIn=false;try{signedIn=Boolean(await pageUser());}catch{}if(signedIn)redirect(target);return <LoginForm returnTo={target}/>;}
