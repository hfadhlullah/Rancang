import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const token = await convexAuthNextjsToken().catch(() => null);
  if (token) {
    redirect("/dashboard");
  }
  redirect("/auth");
}
