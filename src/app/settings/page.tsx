"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SettingsForm } from "@/components/settings/SettingsForm";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="font-semibold">Settings</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">AI Provider</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure which AI service to use for plan generation and critique.
          </p>
        </div>
        <SettingsForm />
      </main>
    </div>
  );
}
