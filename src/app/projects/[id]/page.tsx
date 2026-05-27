import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";
import { EditorShell } from "@/components/editor/EditorShell";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const token = await convexAuthNextjsToken().catch(() => null);
  if (!token) redirect("/auth");
  const { id } = await params;
  return <EditorShell projectId={id} />;
}
