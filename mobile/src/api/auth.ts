import * as SecureStore from "expo-secure-store";
import { api,setApiToken } from "./client";
export type StaffUser={id:string;name?:string;email:string;role:string};
type LoginResponse={success:boolean;data:{token:string;user:StaffUser}};
const STAFF_TOKEN_KEY="nasaem_staff_token";
export async function staffLogin(email:string,password:string){
 const res=await api<LoginResponse>("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});
 setApiToken(res.data.token);
 await SecureStore.setItemAsync(STAFF_TOKEN_KEY,res.data.token);
 return res.data.user;
}
export async function restoreStaffSession(){
 const token=await SecureStore.getItemAsync(STAFF_TOKEN_KEY);
 if(token)setApiToken(token);
 return Boolean(token);
}
export async function staffLogoutLocal(){
 setApiToken(null);
 await SecureStore.deleteItemAsync(STAFF_TOKEN_KEY);
}
