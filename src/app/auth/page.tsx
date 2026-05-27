import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/SignInForm";

export default async function AuthPage() {
  const token = await convexAuthNextjsToken().catch(() => null);
  if (token) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Rancang</h1>
          <p className="text-muted-foreground text-sm">
            AI co-pilot for floor plan critique
          </p>
        </div>
        <SignInForm />
      </div>
    </div>
  );
}
