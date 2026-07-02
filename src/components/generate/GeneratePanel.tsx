"use client";

import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Plan } from "@/lib/types/plan";
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Send, RotateCcw } from "lucide-react";

interface Props {
  plan: Plan;
  onPlanChange: (plan: Plan) => void;
}

type UserMsg = { role: "user"; text: string };
type AssistantMsg = { role: "assistant"; plan: Plan; planJson: string; summary: string };
type ChatMsg = UserMsg | AssistantMsg;

function planSummary(plan: Plan): string {
  const rooms = Object.values(plan.rooms);
  const walls = Object.values(plan.walls);
  const floors = plan.metadata.floors ?? 1;
  const byType: Record<string, number> = {};
  for (const r of rooms) byType[r.type] = (byType[r.type] ?? 0) + 1;
  const parts: string[] = [];
  if (byType.bedroom) parts.push(`${byType.bedroom} bed`);
  if (byType.bathroom) parts.push(`${byType.bathroom} bath`);
  if (byType.kitchen) parts.push("kitchen");
  if (byType.living) parts.push("living");
  if (floors > 1) parts.push(`${floors} floors`);
  if (parts.length === 0) parts.push(`${rooms.length} rooms`);
  parts.push(`${walls.length} walls`);
  return parts.join(" · ");
}

export function GeneratePanel({ plan, onPlanChange }: Props) {
  const generate = useAction(api.generate.generate);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Only pass user messages as history — plan JSON is sent separately as currentPlanJson.
  // Putting plan JSON in assistant turns causes context blowup and model outputs prose/YAML.
  function buildLLMHistory(): Array<{ role: "user" | "assistant"; content: string }> {
    return messages
      .filter((m): m is UserMsg => m.role === "user")
      .map((m) => ({ role: "user" as const, content: m.text }));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    setError(null);
    setRunning(true);

    const userMsg: UserMsg = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);

    const history = buildLLMHistory();

    try {
      const result = (await generate({
        prompt: text,
        currentPlanJson: JSON.stringify(plan),
        chatHistory: history,
      })) as unknown as { plan: Plan; planJson: string };

      const assistantMsg: AssistantMsg = {
        role: "assistant",
        plan: result.plan,
        planJson: result.planJson,
        summary: planSummary(result.plan),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      onPlanChange(result.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      // Remove the user message we optimistically added
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setRunning(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleReset() {
    setMessages([]);
    setError(null);
    setInput("");
  }

  function handleRestorePlan(msg: AssistantMsg) {
    onPlanChange(msg.plan);
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, running]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h2 className="font-semibold text-sm flex items-center gap-1.5">
          <Sparkles size={14} />
          AI Design Chat
        </h2>
        {messages.length > 0 && (
          <button
            onClick={handleReset}
            title="Start over"
            className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {isEmpty && (
          <div className="text-center text-xs text-muted-foreground pt-6 space-y-2">
            <Sparkles size={24} className="mx-auto opacity-30" />
            <p>Describe your project to generate a floor plan.</p>
            <p className="text-[11px] opacity-70">You can keep chatting to refine it.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "user" ? (
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-xs">
                {msg.text}
              </div>
            ) : (
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted border px-3 py-2 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Sparkles size={11} />
                  <span className="font-medium">Plan generated</span>
                </div>
                <p className="text-foreground/80">{msg.summary}</p>
                <button
                  onClick={() => handleRestorePlan(msg)}
                  className="text-[10px] text-primary hover:underline"
                >
                  Restore this version
                </button>
              </div>
            )}
          </div>
        ))}

        {running && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm bg-muted border px-3 py-2 text-xs flex items-center gap-2 text-muted-foreground">
              <Loader2 size={11} className="animate-spin" />
              Designing…
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isEmpty ? "e.g. 3-bedroom house, 160m², 2 floors, inner courtyard" : "Refine the plan…"}
            rows={2}
            className="flex-1 rounded-xl border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <button
            onClick={handleSend}
            disabled={running || !input.trim()}
            className="rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 pl-1">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
