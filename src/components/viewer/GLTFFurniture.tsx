"use client";

import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";
import { Furniture } from "@/lib/types/plan";
import { FurnitureDef } from "@/lib/furniture/catalog";

interface Props {
  item: Furniture;
  def: FurnitureDef;
  ghost?: boolean;
  highlight?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: () => void;
}

function Model({ item, def, ghost, highlight, onPointerDown, onPointerOver, onPointerOut }: Props) {
  const url = item.modelUrl ?? def.modelUrl!;
  const { scene } = useGLTF(url);

  const model = useMemo(() => {
    const clone = scene.clone(true);

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = Math.min(
      size.x > 0 ? def.w / size.x : 1,
      size.y > 0 ? def.h / size.y : 1,
      size.z > 0 ? def.d / size.z : 1
    );
    clone.scale.setScalar(scale);

    // recenter on footprint, sit on floor
    const scaledBox = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y -= scaledBox.min.y;

    clone.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        const applyTint = (mat: THREE.Material) => {
          const cloned = mat.clone();
          if (cloned instanceof THREE.MeshStandardMaterial || cloned instanceof THREE.MeshPhysicalMaterial) {
            if (highlight) cloned.emissive = new THREE.Color("#f59e0b");
            if (ghost) {
              cloned.transparent = true;
              cloned.opacity = 0.5;
            }
          }
          return cloned;
        };
        node.material = Array.isArray(node.material) ? node.material.map(applyTint) : applyTint(node.material);
      }
    });

    return clone;
  }, [scene, def.w, def.h, def.d, ghost, highlight]);

  return (
    <primitive
      object={model}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    />
  );
}

function FallbackBox({ def, ghost }: Props) {
  return (
    <mesh position={[0, def.h / 2, 0]}>
      <boxGeometry args={[def.w, def.h, def.d]} />
      <meshStandardMaterial color={def.color} transparent={ghost} opacity={ghost ? 0.5 : 1} />
    </mesh>
  );
}

/** Loads a real GLTF/GLB model for a furniture def, scaled to its catalog bounding box.
 * Falls back to a plain box while loading via Suspense. */
export function GLTFFurniture(props: Props) {
  return (
    <Suspense fallback={<FallbackBox {...props} />}>
      <Model {...props} />
    </Suspense>
  );
}
