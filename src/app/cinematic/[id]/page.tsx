import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";
import { CinematicMode } from "@/components/cinematic/CinematicMode";

export default async function CinematicPage({ params }: { params: Promise<{ id: string }> }) {
  const token = await convexAuthNextjsToken().catch(() => null);
  if (!token) redirect("/auth");
  const { id } = await params;
  return <CinematicMode projectId={id} />;
}
