import { FurnitureKind } from "@/lib/types/plan";

export interface FurnitureDef {
  kind: FurnitureKind;
  label: string;
  category: "bedroom" | "living" | "dining" | "bathroom" | "kitchen" | "decor";
  /** Footprint in meters: w = along local X, d = along local Y (depth) */
  w: number;
  d: number;
  /** Overall height in meters, used for 3D bounding */
  h: number;
  /** Default body color */
  color: string;
  /** Optional GLTF/GLB path (served from public/), e.g. "/models/sofa.glb". Falls back to procedural geometry when absent. */
  modelUrl?: string;
}

export const FURNITURE_CATALOG: FurnitureDef[] = [
  { kind: "bed-double", label: "Double Bed", category: "bedroom", w: 1.6, d: 2.0, h: 0.55, color: "#93a8c7", modelUrl: "/models/kaykit/bed_double_A.gltf" },
  { kind: "bed-single", label: "Single Bed", category: "bedroom", w: 0.9, d: 2.0, h: 0.55, color: "#a3b8d0", modelUrl: "/models/kaykit/bed_single_A.gltf" },
  { kind: "wardrobe", label: "Wardrobe", category: "bedroom", w: 1.2, d: 0.6, h: 2.0, color: "#8b6f4e", modelUrl: "/models/kaykit/cabinet_medium.gltf" },
  { kind: "desk", label: "Desk", category: "bedroom", w: 1.2, d: 0.6, h: 0.75, color: "#a0774f", modelUrl: "/models/kaykit/table_small.gltf" },
  { kind: "sofa", label: "Sofa", category: "living", w: 2.0, d: 0.9, h: 0.8, color: "#6b7f9e", modelUrl: "/models/sofa.glb" },
  { kind: "armchair", label: "Armchair", category: "living", w: 0.9, d: 0.9, h: 0.8, color: "#7d8fa8", modelUrl: "/models/sofa.glb" },
  { kind: "coffee-table", label: "Coffee Table", category: "living", w: 1.0, d: 0.6, h: 0.45, color: "#9c7a52", modelUrl: "/models/kaykit/table_low.gltf" },
  { kind: "tv-stand", label: "TV Stand", category: "living", w: 1.4, d: 0.4, h: 0.5, color: "#4b5563", modelUrl: "/models/kaykit/shelf_B_large.gltf" },
  { kind: "dining-table", label: "Dining Table", category: "dining", w: 1.6, d: 0.9, h: 0.75, color: "#a0774f", modelUrl: "/models/kaykit/table_medium_long.gltf" },
  { kind: "chair", label: "Chair", category: "dining", w: 0.45, d: 0.45, h: 0.9, color: "#8b6f4e", modelUrl: "/models/chair.glb" },
  { kind: "toilet", label: "Toilet", category: "bathroom", w: 0.4, d: 0.7, h: 0.75, color: "#f3f4f6" },
  { kind: "sink", label: "Sink", category: "bathroom", w: 0.5, d: 0.4, h: 0.85, color: "#f3f4f6" },
  { kind: "shower", label: "Shower", category: "bathroom", w: 0.9, d: 0.9, h: 2.0, color: "#bfdbfe" },
  { kind: "bathtub", label: "Bathtub", category: "bathroom", w: 0.8, d: 1.7, h: 0.55, color: "#f3f4f6" },
  { kind: "counter", label: "Counter", category: "kitchen", w: 0.6, d: 0.6, h: 0.9, color: "#d6d3d1", modelUrl: "/models/kaykit/cabinet_small.gltf" },
  { kind: "stove", label: "Stove", category: "kitchen", w: 0.6, d: 0.6, h: 0.9, color: "#6b7280" },
  { kind: "fridge", label: "Fridge", category: "kitchen", w: 0.7, d: 0.7, h: 1.8, color: "#e5e7eb", modelUrl: "/models/fridge.glb" },
  { kind: "plant", label: "Plant", category: "decor", w: 0.4, d: 0.4, h: 1.2, color: "#4d7c0f", modelUrl: "/models/plant.glb" },
];

export const FURNITURE_BY_KIND: Record<string, FurnitureDef> = Object.fromEntries(
  FURNITURE_CATALOG.map((f) => [f.kind, f])
);

export const FURNITURE_CATEGORIES = ["living", "bedroom", "dining", "kitchen", "bathroom", "decor"] as const;
