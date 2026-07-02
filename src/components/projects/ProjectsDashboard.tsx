"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { Plus, LogOut, FolderOpen, Settings } from "lucide-react";
import { CreateProjectDialog } from "./CreateProjectDialog";

export function ProjectsDashboard() {
  const projects = useQuery(api.projects.list);
  const [showCreate, setShowCreate] = useState(false);
  const { signOut } = useAuthActions();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-lg">Rancang</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/settings")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings size={14} />
              Settings
            </button>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Projects</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} />
            New project
          </button>
        </div>

        {projects === undefined ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-lg border bg-muted animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <FolderOpen size={40} className="mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No projects yet.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-sm text-primary hover:underline"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p: { _id: string; name: string; description?: string; updatedAt: number }) => (
              <button
                key={p._id}
                onClick={() => router.push(`/projects/${p._id}`)}
                className="text-left rounded-lg border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all space-y-2"
              >
                <p className="font-medium truncate">{p.name}</p>
                {p.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>

      {showCreate && <CreateProjectDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
