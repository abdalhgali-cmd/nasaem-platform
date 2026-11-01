import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminToolFrame } from "@/components/admin/tools/admin-tool-frame";
import { adminTool } from "@/components/admin/tools/admin-tools";

type Props = {
  params: Promise<{ tool: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = adminTool((await params).tool);
  return { title: tool ? `${tool.label} — نسائم الحرمين` : "نسائم الحرمين" };
}

export default async function AdminToolPage({ params, searchParams }: Props) {
  const tool = adminTool((await params).tool);
  if (!tool) notFound();
  const id = (await searchParams).id;
  return (
    <AdminShell title={tool.label} description={tool.description}>
      <AdminToolFrame toolKey={tool.key} id={typeof id === "string" ? id : null} />
    </AdminShell>
  );
}
