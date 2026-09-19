import { api } from "./client";

export type AdminDocument={
  id:string;
  label?:string|null;
  status?:string|null;
  fileName?:string|null;
  reviewNote?:string|null;
};
export type AdminRequest={
  id:string;
  name:string;
  phone:string;
  service?:string|null;
  status:string;
  paymentStatus?:string|null;
  createdAt?:string;
  invoice?:{id:string;amount:number|string;currency:string;status:string}|null;
  documents?:AdminDocument[];
  travelers?:Array<{id:string;fullName:string;passportNo?:string|null;nationality?:string|null}>;
  readiness?:{queue?:string;overall?:string};
};
type RequestListResponse={success:boolean;data:AdminRequest[];meta?:unknown};

export async function getAdminRequests(){
  const r=await api<RequestListResponse>("/api/contact-requests?limit=100");
  return r.data;
}
export async function getOperationsCenter(){
  const r=await api<{success:boolean;data?:unknown}>("/api/dashboard/operations");
  return r.data??r;
}
export async function updateAdminRequestStatus(id:string,status:"NEW"|"CONTACTED"|"CLOSED",outcome?:"COMPLETED"|"REJECTED"|"CANCELLED",outcomeNote?:string){
  return api(`/api/contact-requests/${encodeURIComponent(id)}/status`,{method:"PATCH",body:JSON.stringify({status,...(outcome?{outcome}:{}),...(outcomeNote?{outcomeNote}:{})})});
}
export async function confirmAdminPayment(id:string){
  return api(`/api/contact-requests/${encodeURIComponent(id)}/confirm-payment`,{method:"POST",body:JSON.stringify({})});
}
export async function reviewAdminDocument(requestId:string,documentId:string,status:"ACCEPTED"|"REJECTED",reviewNote?:string){
  return api(`/api/contact-requests/${encodeURIComponent(requestId)}/documents/${encodeURIComponent(documentId)}/status`,{method:"PATCH",body:JSON.stringify({status,...(reviewNote?{reviewNote}:{})})});
}
