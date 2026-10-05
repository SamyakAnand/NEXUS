"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Quaternion, Vector3 } from "three";
import type { Group } from "three";
import type { ColumnProfile } from "@/lib/api";

const colors = { numeric: "#2476df", categorical: "#43a78b", temporal: "#8c6ad4", text: "#91a4bb" };

function canUseWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch { return false; }
}

function DataScene({ columns, reducedMotion, onSelect }: { columns: ColumnProfile[]; reducedMotion: boolean; onSelect: (column: ColumnProfile) => void }) {
  const universe = useRef<Group>(null);
  const { pointer } = useThree();
  const centerAxis = useMemo(() => new Vector3(0, 1, 0), []);
  const data = useMemo(() => columns.slice(0, 16).map((column, index) => {
    const angle = (index / Math.max(columns.length, 1)) * Math.PI * 2;
    const ring = index % 2 === 0 ? 2.05 : 2.72;
    const position: [number, number, number] = [Math.cos(angle) * ring, Math.sin(index * 1.65) * 0.9, Math.sin(angle) * ring];
    const vector = new Vector3(...position);
    const length = vector.length();
    const quaternion = new Quaternion().setFromUnitVectors(centerAxis, vector.clone().normalize());
    const radius = 0.15 + Math.min(0.16, Math.log10(column.unique + 1) * 0.04);
    return { column, position, length, quaternion, radius, color: column.missing_pct > 10 ? "#e8a13a" : colors[column.semantic_type] };
  }), [columns, centerAxis]);

  useFrame((_, delta) => {
    if (!universe.current || reducedMotion) return;
    universe.current.rotation.y += delta * 0.055;
    universe.current.rotation.x = MathUtils.lerp(universe.current.rotation.x, pointer.y * 0.05, 0.025);
    universe.current.rotation.z = MathUtils.lerp(universe.current.rotation.z, -pointer.x * 0.04, 0.025);
  });

  return <>
    <ambientLight intensity={1.8} />
    <directionalLight position={[4, 6, 4]} intensity={1.7} color="#ffffff" />
    <group ref={universe}>
      <mesh>
        <icosahedronGeometry args={[0.8, 1]} />
        <meshStandardMaterial color="#1768d2" roughness={0.33} metalness={0.04} />
      </mesh>
      {data.map(({ column, position, length, quaternion, radius, color }) => <group key={column.name}>
        <mesh position={[position[0] / 2, position[1] / 2, position[2] / 2]} quaternion={quaternion as Quaternion}>
          <cylinderGeometry args={[0.012, 0.012, length, 7]} />
          <meshBasicMaterial color={column.missing_pct > 10 ? "#e2ad5d" : "#aac8e7"} transparent opacity={0.83} />
        </mesh>
        <mesh position={position} onPointerDown={event => { event.stopPropagation(); onSelect(column); }}>
          <sphereGeometry args={[radius, 22, 18]} />
          <meshStandardMaterial color={color} roughness={0.32} metalness={0.03} />
        </mesh>
      </group>)}
    </group>
  </>;
}

export function DatasetUniverse({ columns }: { columns: ColumnProfile[] }) {
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [selectedField, setSelectedField] = useState<ColumnProfile | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const change = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener("change", change);
    setWebgl(canUseWebGL());
    setReady(true);
    return () => media.removeEventListener("change", change);
  }, []);

  if (!ready || !webgl) return <div className="universe-fallback" aria-label="Dataset schema overview">
    <p className="fallback-note">{ready ? "3D is unavailable here. Schema summary remains available." : "Preparing schema view…"}</p>
    <div className="schema-list">{columns.slice(0, 12).map(column => <div className="schema-row" key={column.name}><span className={`schema-dot ${column.semantic_type}`} /><span>{column.name}</span><small>{column.semantic_type} · {column.unique.toLocaleString()} unique</small></div>)}</div>
  </div>;

  return <div className="universe-canvas" aria-label="Interactive 3D dataset schema map; node size reflects distinct-value count, lines show column membership in the uploaded table.">
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.3, 7.8], fov: 42 }} gl={{ antialias: true, alpha: true }}>
      <DataScene columns={columns} reducedMotion={reducedMotion} onSelect={setSelectedField} />
    </Canvas>
    <div className="universe-labels" aria-live="polite"><span className="universe-table-label"><i className="dataset-node" />{selectedField ? `${selectedField.name} · ${selectedField.semantic_type} · ${selectedField.unique.toLocaleString()} unique` : "Dataset table · select a field node"}</span></div>
    <div className="universe-field-dock" aria-label="Dataset fields">{columns.slice(0, 8).map(column => <button className={selectedField?.name === column.name ? "selected" : ""} key={column.name} onClick={() => setSelectedField(column)}><i className={`schema-dot ${column.semantic_type}`} />{column.name}</button>)}{columns.length > 8 && <span>+{columns.length - 8} fields</span>}</div>
    <p className="canvas-caption">Node size = distinct values · lines = dataset membership{columns.length > 16 ? " · first 16 fields shown" : ""}</p>
  </div>;
}
