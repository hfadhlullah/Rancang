"use client";

import { Plan, Room, RoomType } from "@/lib/types/plan";
import { ROOM_COLORS } from "@/lib/canvas/planUtils";
import { recalcRoomAreas } from "@/lib/canvas/planUtils";
import { useState } from "react";
import { Trash2 } from "lucide-react";

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: "bedroom", label: "Bedroom" },
  { value: "bathroom", label: "Bathroom" },
  { value: "kitchen", label: "Kitchen" },
  { value: "living", label: "Living" },
  { value: "dining", label: "Dining" },
  { value: "corridor", label: "Corridor" },
  { value: "storage", label: "Storage" },
  { value: "garage", label: "Garage" },
  { value: "outdoor", label: "Outdoor" },
  { value: "other", label: "Other" },
];

interface Props {
  plan: Plan;
  onPlanChange: (plan: Plan) => void;
}

export function RoomEditor({ plan, onPlanChange }: Props) {
  const rooms = Object.values(plan.rooms);

  function updateRoom(id: string, patch: Partial<Room>) {
    const updated = { ...plan.rooms[id], ...patch };
    if (patch.type) updated.color = ROOM_COLORS[patch.type] ?? "#f9fafb";
    const newPlan = recalcRoomAreas({
      ...plan,
      rooms: { ...plan.rooms, [id]: updated },
    });
    onPlanChange(newPlan);
  }

  function deleteRoom(id: string) {
    const { [id]: _, ...rooms } = plan.rooms;
    onPlanChange({ ...plan, rooms });
  }

  if (rooms.length === 0) {
    return (
      <div className="p-4 space-y-2">
        <h2 className="font-semibold text-sm">Rooms</h2>
        <p className="text-xs text-muted-foreground">
          No rooms defined. Use the Room tool (R) to draw room polygons on the canvas.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="font-semibold text-sm">Rooms</h2>
      {rooms.map((room) => (
        <div key={room.id} className="rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm shrink-0 border"
              style={{ background: room.color ?? "#f9fafb" }}
            />
            <input
              type="text"
              value={room.name}
              onChange={(e) => updateRoom(room.id, { name: e.target.value })}
              className="flex-1 min-w-0 text-sm font-medium bg-transparent border-b border-transparent hover:border-border focus:border-border focus:outline-none py-0.5"
            />
            <button
              onClick={() => deleteRoom(room.id)}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={room.type}
              onChange={(e) => updateRoom(room.id, { type: e.target.value as RoomType })}
              className="flex-1 text-xs rounded border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {ROOM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {room.area !== undefined && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {room.area.toFixed(1)} m²
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
