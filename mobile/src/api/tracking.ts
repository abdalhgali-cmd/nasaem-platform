import * as SecureStore from "expo-secure-store";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api as rawApi, API_URL, ApiError } from "./client";
import type { UploadAsset } from "./requests";

// A 401 from a tracking endpoint means the saved session expired: forget it so the
// app sends the customer back to phone verification instead of failing silently.
async function api<T>(path:string,init?:RequestInit):Promise<T>{
 try{return await rawApi<T>(path,init);}
 catch(error){
  if(error instanceof ApiError&&error.status===401&&path.startsWith("/api/tracking/")&&!path.includes("verify-code"))await clearTrackingSession();
  throw error;
 }
}

let trackingToken:string|null=null;
const TRACKING_TOKEN_KEY="nasaem_tracking_token";

type VerifyResponse={success:boolean;data?:{token?:string}};
export type TrackedOffer={id:string;carrier?:string;amount?:number|string;currency?:string;description?:string|null};
export type PaymentAccount={id:string;name?:string;bankName?:string|null;accountName?:string|null;accountNumber?:string|null;iban?:string|null;currency?:string};
export type TrackedRequest={
 id:string;
 service?:string|null;
 status?:string;
 statusLabel?:string;
 paymentStatus?:string|null;
 paymentCurrency?:string|null;
 paymentAmount?:number|null;
 paymentBaseAmount?:number|null;
 paymentBaseCurrency?:string|null;
 paymentFxRate?:number|null;
 paymentOptions?:string[];
 createdAt?:string;
 selectedOfferId?:string|null;
 invoice?:{amount?:number|string;currency?:string;status?:string}|null;
 offers?:TrackedOffer[];
 paymentAccounts?:PaymentAccount[];
 visaType?:{id:string;code?:string;name?:string;country?:string}|null;
 intakeData?:Record<string,any>|null;
 deliverables?:{id:string;label?:string;fileName?:string}[];
 checklist?:{requirementId:string;label:string;description?:string|null;kind:string;required:boolean;state:string;documentId?:string|null;reviewNote?:string|null;travelerId?:string|null;travelerName?:string|null;answer?:string|null}[];
 nextActions?:{code:string;label:string;reason?:string|null;requirementId?:string;travelerId?:string|null}[];
 [key:string]:unknown;
};

export async function requestTrackingCode(phone:string){
 return api<{success:boolean;message:string;debugCode?:string}>("/api/tracking/request-code",{method:"POST",body:JSON.stringify({phone})});
}
export async function verifyTrackingCode(phone:string,code:string){
 const response=await api<VerifyResponse>("/api/tracking/verify-code",{method:"POST",body:JSON.stringify({phone,code})});
 const token=response.data?.token;
 if(!token)throw new Error("لم يتم استلام جلسة التتبع");
 trackingToken=token;
 await SecureStore.setItemAsync(TRACKING_TOKEN_KEY,token);
}
export async function restoreTrackingSession(){
 trackingToken=await SecureStore.getItemAsync(TRACKING_TOKEN_KEY);
 return Boolean(trackingToken);
}
export function hasTrackingSession(){return Boolean(trackingToken);}
export async function clearTrackingSession(){
 trackingToken=null;
 await SecureStore.deleteItemAsync(TRACKING_TOKEN_KEY);
}
function authHeaders(){if(!trackingToken)throw new Error("جلسة التتبع غير موجودة");return {Authorization:`Bearer ${trackingToken}`};}
export async function getTrackedRequests(){const r=await api<{success:boolean;data:TrackedRequest[]}>("/api/tracking/requests",{headers:authHeaders()});return r.data;}
export async function approveTrackedInvoice(id:string){return api(`/api/tracking/requests/${encodeURIComponent(id)}/invoice/approve`,{method:"POST",headers:authHeaders()});}
export async function rejectTrackedInvoice(id:string){return api(`/api/tracking/requests/${encodeURIComponent(id)}/invoice/reject`,{method:"POST",headers:authHeaders()});}
export async function selectTrackedOffer(id:string,offerId:string){return api(`/api/tracking/requests/${encodeURIComponent(id)}/offers/${encodeURIComponent(offerId)}/select`,{method:"POST",headers:authHeaders()});}
export async function chooseTrackedPaymentCurrency(id:string,currency:string){return api(`/api/tracking/requests/${encodeURIComponent(id)}/payment-currency`,{method:"POST",headers:authHeaders(),body:JSON.stringify({currency})});}
export async function markTrackedTransferSent(id:string){return api(`/api/tracking/requests/${encodeURIComponent(id)}/mark-transfer-sent`,{method:"POST",headers:authHeaders()});}
export async function uploadTrackedDocument(id:string,input:{label:string;requirementId?:string;travelerId?:string|null},file:UploadAsset){
 const body=new FormData();
 body.append("label",input.label);
 if(input.requirementId)body.append("requirementId",input.requirementId);
 if(input.travelerId)body.append("travelerId",input.travelerId);
 body.append("file",{uri:file.uri,name:file.name,type:file.mimeType||"application/octet-stream"} as unknown as Blob);
 return api(`/api/tracking/requests/${encodeURIComponent(id)}/documents`,{method:"POST",headers:authHeaders(),body});
}
export async function uploadTrackedPaymentReceipt(id:string,file:UploadAsset){
 const body=new FormData();
 body.append("file",{uri:file.uri,name:file.name,type:file.mimeType||"application/octet-stream"} as unknown as Blob);
 return api(`/api/tracking/requests/${encodeURIComponent(id)}/payment-receipt`,{method:"POST",headers:authHeaders(),body});
}
export async function saveEgyptTravelPlan(id:string,input:{entryMode:"AIR"|"BORDER";bookingStatus:"EXISTING"|"NEEDS_NASAEM";entryDate:string},file?:UploadAsset|null){
 const body=new FormData();
 body.append("entryMode",input.entryMode);
 body.append("bookingStatus",input.bookingStatus);
 body.append("entryDate",input.entryDate);
 if(file)body.append("file",{uri:file.uri,name:file.name,type:file.mimeType||"application/octet-stream"} as unknown as Blob);
 return api<{success:boolean;message:string;data?:any}>(`/api/tracking/requests/${encodeURIComponent(id)}/egypt-travel-plan`,{method:"POST",headers:authHeaders(),body});
}

export type Deliverable={id:string;label?:string;fileName?:string};
function safeFileName(deliverable:Deliverable){
 const base=(deliverable.fileName||deliverable.label||"document").replace(/[^\w.\-\u0600-\u06FF]+/g,"_").slice(0,80);
 return base.includes(".")?base:`${base}.pdf`;
}
/**
 * Downloads an issued document (visa, ticket, voucher) with the session's bearer
 * token — the endpoint is not public, so a plain link cannot be opened — saves it
 * to the app cache and opens the system share/open sheet.
 */
export async function downloadDeliverable(requestId:string,deliverable:Deliverable){
 const url=`${API_URL}/api/tracking/requests/${encodeURIComponent(requestId)}/deliverables/${encodeURIComponent(deliverable.id)}/file`;
 const destination=new File(Paths.cache,`${deliverable.id}-${safeFileName(deliverable)}`);
 if(destination.exists)destination.delete();
 const saved=await File.downloadFileAsync(url,destination,{headers:authHeaders()}).catch(()=>{throw new Error("تعذر تنزيل الملف. تحقق من الاتصال ثم حاول مرة أخرى.");});
 if(!(await Sharing.isAvailableAsync()))throw new Error("تم تنزيل الملف لكن لا يوجد تطبيق لفتحه على هذا الجهاز.");
 await Sharing.shareAsync(saved.uri,{dialogTitle:deliverable.label||"المستند"});
 return saved.uri;
}
