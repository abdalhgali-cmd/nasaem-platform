import { api } from "./client";

export type CaseNote={id:string;body:string;createdAt:string;author:{id:string;fullName:string}|null};

export async function getCaseNotes(requestId:string){
 const r=await api<{success:boolean;data:CaseNote[]}>(`/api/contact-requests/${encodeURIComponent(requestId)}/notes`);
 return r.data;
}
export async function addCaseNote(requestId:string,body:string){
 const r=await api<{success:boolean;data:CaseNote}>(`/api/contact-requests/${encodeURIComponent(requestId)}/notes`,{method:"POST",body:JSON.stringify({body})});
 return r.data;
}
