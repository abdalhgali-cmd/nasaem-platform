import { api } from "./client";
export type AdminDashboard={stats?:Record<string,number>;operations?:unknown[];[key:string]:unknown};
export async function getAdminDashboard(){return api<AdminDashboard>("/api/dashboard/summary");}
export async function getOperationsCenter(){return api<unknown>("/api/dashboard/operations");}
