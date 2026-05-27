import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";
import { ProjectsDashboard } from "@/components/projects/ProjectsDashboard";

export default async function DashboardPage() {
  const token = await convexAuthNextjsToken().catch(() => null);
  if (!token) redirect("/auth");

  return <ProjectsDashboard />;
}
