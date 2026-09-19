import Constants from "expo-constants";
const API_URL=process.env.EXPO_PUBLIC_API_URL??(Constants.expoConfig?.extra?.apiUrl as string|undefined);
if(!API_URL)throw new Error("Missing EXPO_PUBLIC_API_URL");
let bearerToken:string|null=null;
export function setApiToken(token:string|null){bearerToken=token;}
export class ApiError extends Error{constructor(message:string,public readonly status:number,public readonly payload?:unknown){super(message);}}
export async function api<T>(path:string,init?:RequestInit):Promise<T>{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(`${API_URL}${path}`,{...init,headers:{Accept:"application/json",...(init?.body?{"Content-Type":"application/json"}:{}),...(bearerToken?{Authorization:`Bearer ${bearerToken}`}:{}),...init?.headers},signal:controller.signal});const payload=await response.json().catch(()=>null);if(!response.ok)throw new ApiError("تعذر إكمال الطلب",response.status,payload);return payload as T;}finally{clearTimeout(timeout);}}
