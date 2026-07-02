"use client";

import { ThreeEvent } from "@react-three/fiber";
import { Furniture } from "@/lib/types/plan";
import { FURNITURE_BY_KIND } from "@/lib/furniture/catalog";

const METERS_PER_PX = 1 / 50;

interface Props {
  item: Furniture;
  yOffset: number;
  ghost?: boolean;
  highlight?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: () => void;
}

/** Parametric furniture built from primitives — no external assets.
 * Local space: X = width, Z = depth, Y = up. Origin at footprint center on floor. */
export function Furniture3D({ item, yOffset, ghost, highlight, onPointerDown, onPointerOver, onPointerOut }: Props) {
  const def = FURNITURE_BY_KIND[item.kind];
  if (!def) return null;
  const color = highlight ? "#f59e0b" : item.color ?? def.color;
  const opacity = ghost ? 0.5 : 1;
  const mat = <meshStandardMaterial color={color} transparent={ghost} opacity={opacity} />;
  const woodMat = <meshStandardMaterial color={ghost || highlight ? color : "#8b6f4e"} transparent={ghost} opacity={opacity} />;
  const { w, d, h } = def;

  let body: React.ReactNode;
  switch (item.kind) {
    case "bed-double":
    case "bed-single":
      body = (
        <>
          {/* frame + mattress */}
          <mesh position={[0, 0.15, 0]} castShadow>
            <boxGeometry args={[w, 0.3, d]} />
            {woodMat}
          </mesh>
          <mesh position={[0, 0.375, 0]} castShadow>
            <boxGeometry args={[w * 0.95, 0.15, d * 0.95]} />
            {mat}
          </mesh>
          {/* pillow(s) */}
          <mesh position={[0, 0.5, -d / 2 + 0.3]} castShadow>
            <boxGeometry args={[w * 0.8, 0.1, 0.4]} />
            <meshStandardMaterial color="#f9fafb" transparent={ghost} opacity={opacity} />
          </mesh>
          {/* headboard */}
          <mesh position={[0, 0.45, -d / 2 + 0.025]} castShadow>
            <boxGeometry args={[w, 0.9, 0.05]} />
            {woodMat}
          </mesh>
        </>
      );
      break;
    case "sofa":
    case "armchair":
      body = (
        <>
          <mesh position={[0, 0.2, 0]} castShadow>
            <boxGeometry args={[w, 0.4, d]} />
            {mat}
          </mesh>
          {/* backrest */}
          <mesh position={[0, 0.5, -d / 2 + 0.1]} castShadow>
            <boxGeometry args={[w, 0.6, 0.2]} />
            {mat}
          </mesh>
          {/* armrests */}
          <mesh position={[-w / 2 + 0.1, 0.35, 0]} castShadow>
            <boxGeometry args={[0.2, 0.3, d]} />
            {mat}
          </mesh>
          <mesh position={[w / 2 - 0.1, 0.35, 0]} castShadow>
            <boxGeometry args={[0.2, 0.3, d]} />
            {mat}
          </mesh>
        </>
      );
      break;
    case "coffee-table":
    case "dining-table":
    case "desk": {
      const legInset = 0.06;
      body = (
        <>
          <mesh position={[0, h - 0.025, 0]} castShadow>
            <boxGeometry args={[w, 0.05, d]} />
            {mat}
          </mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([lx, lz], i) => (
            <mesh key={i} position={[lx * (w / 2 - legInset), (h - 0.05) / 2, lz * (d / 2 - legInset)]} castShadow>
              <boxGeometry args={[0.06, h - 0.05, 0.06]} />
              {mat}
            </mesh>
          ))}
        </>
      );
      break;
    }
    case "chair":
      body = (
        <>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[w, 0.05, d]} />
            {mat}
          </mesh>
          <mesh position={[0, 0.225, 0]}>
            <boxGeometry args={[0.05, 0.45, 0.05]} />
            {mat}
          </mesh>
          <mesh position={[0, 0.675, -d / 2 + 0.025]} castShadow>
            <boxGeometry args={[w, 0.45, 0.05]} />
            {mat}
          </mesh>
        </>
      );
      break;
    case "wardrobe":
    case "fridge":
      body = (
        <mesh position={[0, h / 2, 0]} castShadow>
          <boxGeometry args={[w, h, d]} />
          {mat}
        </mesh>
      );
      break;
    case "counter":
    case "stove":
    case "tv-stand":
      body = (
        <>
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[w, h, d]} />
            {mat}
          </mesh>
          {item.kind === "stove" && (
            <mesh position={[0, h + 0.005, 0]}>
              <boxGeometry args={[w * 0.9, 0.01, d * 0.9]} />
              <meshStandardMaterial color="#1f2937" transparent={ghost} opacity={opacity} />
            </mesh>
          )}
        </>
      );
      break;
    case "toilet":
      body = (
        <>
          <mesh position={[0, 0.2, d * 0.1]} castShadow>
            <cylinderGeometry args={[w / 2, w / 2 * 0.8, 0.4, 16]} />
            {mat}
          </mesh>
          <mesh position={[0, 0.4, -d / 2 + 0.1]} castShadow>
            <boxGeometry args={[w, 0.5, 0.2]} />
            {mat}
          </mesh>
        </>
      );
      break;
    case "sink":
      body = (
        <>
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[0.12, h, 0.12]} />
            {mat}
          </mesh>
          <mesh position={[0, h, 0]} castShadow>
            <cylinderGeometry args={[w / 2, w / 2, 0.12, 16]} />
            {mat}
          </mesh>
        </>
      );
      break;
    case "shower":
      body = (
        <>
          <mesh position={[0, 0.05, 0]} receiveShadow>
            <boxGeometry args={[w, 0.1, d]} />
            <meshStandardMaterial color="#e5e7eb" transparent={ghost} opacity={opacity} />
          </mesh>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color={color} transparent opacity={ghost ? 0.25 : 0.2} />
          </mesh>
        </>
      );
      break;
    case "bathtub":
      body = (
        <>
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[w, h, d]} />
            {mat}
          </mesh>
          <mesh position={[0, h + 0.001, 0]}>
            <boxGeometry args={[w * 0.8, 0.01, d * 0.85]} />
            <meshStandardMaterial color="#bfdbfe" transparent={ghost} opacity={opacity} />
          </mesh>
        </>
      );
      break;
    case "plant":
      body = (
        <>
          <mesh position={[0, 0.15, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.12, 0.3, 12]} />
            <meshStandardMaterial color="#b45309" transparent={ghost} opacity={opacity} />
          </mesh>
          <mesh position={[0, 0.7, 0]} castShadow>
            <sphereGeometry args={[0.3, 12, 10]} />
            {mat}
          </mesh>
        </>
      );
      break;
    default:
      body = (
        <mesh position={[0, h / 2, 0]} castShadow>
          <boxGeometry args={[w, h, d]} />
          {mat}
        </mesh>
      );
  }

  return (
    <group
      position={[item.x * METERS_PER_PX, yOffset, item.y * METERS_PER_PX]}
      rotation={[0, -item.rotation, 0]}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {body}
    </group>
  );
}
