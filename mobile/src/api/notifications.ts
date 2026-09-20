import { api } from "./client";

export type StaffNotification={id:string;title:string;message:string;type:string;readAt?:string|null;createdAt:string};
type ListResponse={success:boolean;data:StaffNotification[];meta?:{unreadCount?:number}};

export async function getStaffNotifications(){
 const r=await api<ListResponse>("/api/notifications?limit=50");
 return {items:r.data,unreadCount:r.meta?.unreadCount??0};
}
export async function markStaffNotificationRead(id:string){
 const r=await api<{success:boolean;data:StaffNotification}>(`/api/notifications/${encodeURIComponent(id)}/read`,{method:"PATCH"});
 return r.data;
}
