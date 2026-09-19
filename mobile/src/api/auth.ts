import { api,setApiToken } from "./client";
export type StaffUser={id:string;name?:string;email:string;role:string};
type LoginResponse={success:boolean;data:{token:string;user:StaffUser}};
export async function staffLogin(email:string,password:string){const res=await api<LoginResponse>("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});setApiToken(res.data.token);return res.data.user;}
export function staffLogoutLocal(){setApiToken(null);}
