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
  travelers?:{id:string;fullName:string;passportNo?:string|null;nationality?:string|null}[];
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


export type AdminCatalogItem={
  id:string;
  code?:string;
  name:string;
  category?:string|null;
  country?:string;
  basePrice:number|string;
  currency:string;
  active?:boolean;
  processingTime?:string|null;
};
export async function getAdminServices(){
 const r=await api<{success:boolean;data:AdminCatalogItem[]}>("/api/services?limit=100");
 return r.data;
}
export async function updateAdminService(id:string,patch:Partial<Pick<AdminCatalogItem,"basePrice"|"currency"|"active"|"processingTime">>){
 return api<{success:boolean;data:AdminCatalogItem}>("/api/services/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(patch)});
}
export async function getAdminVisaTypes(){
 const r=await api<{success:boolean;data:AdminCatalogItem[]}>("/api/visa-types?limit=100");
 return r.data;
}
export async function updateAdminVisaType(id:string,patch:Partial<Pick<AdminCatalogItem,"basePrice"|"currency"|"active"|"processingTime">>){
 return api<{success:boolean;data:AdminCatalogItem}>("/api/visa-types/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(patch)});
}
export type FxRates={USD:number;SAR:number;AED:number;EGP:number;QAR:number};
export async function getAdminFxRates(){
 const r=await api<{success:boolean;data:FxRates}>("/api/flights/admin/rates");
 return r.data;
}
export async function updateAdminFxRates(rates:Partial<FxRates>){
 const r=await api<{success:boolean;data:FxRates}>("/api/flights/admin/rates",{method:"PATCH",body:JSON.stringify(rates)});
 return r.data;
}
