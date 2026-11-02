"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { MathUtils } from "three";
import type { Group } from "three";
import { ArrowUpRight, Database, FileText, Graph, ImageSquare, MagnifyingGlass, ShieldCheck } from "@phosphor-icons/react";

const concepts = [
  { id: "source", name: "Source", note: "A file or dataset enters the workspace.", icon: FileText, position: [-1.85, 0.6, 0.45] as [number, number, number], color: "#55d5d2" },
  { id: "table", name: "Table", note: "Fields and values are profiled before analysis.", icon: Database, position: [1.75, 0.72, -0.3] as [number, number, number], color: "#69a5ff" },
  { id: "chart", name: "Chart", note: "Visuals use results from the selected dataset.", icon: ImageSquare, position: [-1.3, -0.86, -0.7] as [number, number, number], color: "#a590f3" },
  { id: "query", name: "Query", note: "A focused question selects deterministic analysis tools.", icon: MagnifyingGlass, position: [1.38, -0.78, 0.66] as [number, number, number], color: "#59c998" },
  { id: "lineage", name: "Lineage", note: "The current graph traces local sources and analysis steps.", icon: Graph, position: [0.2, 1.56, 0.84] as [number, number, number], color: "#e4b367" },
  { id: "evidence", name: "Evidence", note: "Findings point back to measured fields and run traces.", icon: ShieldCheck, position: [-0.2, -1.55, 0.4] as [number, number, number], color: "#78b9e8" },
];

function CoreObject({ reducedMotion, selected, onSelect }: { reducedMotion: boolean; selected: string; onSelect: (id: string) => void }) {
  const object = useRef<Group>(null);
  const orbits = useRef<Group>(null);
  const particleField = useRef<Group>(null);
  const { pointer } = useThree();
  const particles = useMemo(() => Array.from({ length: 34 }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 2.3 + (index % 5) * 0.16;
    const y = Math.sin(index * 12.29) * 1.5;
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius] as [number, number, number];
  }), []);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    if (object.current) {
      object.current.rotation.y += delta * 0.045;
      object.current.rotation.x = MathUtils.lerp(object.current.rotation.x, pointer.y * 0.045, 0.025);
      object.current.rotation.z = MathUtils.lerp(object.current.rotation.z, -pointer.x * 0.045, 0.025);
    }
    if (orbits.current) orbits.current.rotation.y -= delta * 0.018;
  });

  return <>
    <ambientLight intensity={0.4} />
    <pointLight position={[3, 3, 4]} intensity={29} color="#53d2da" />
    <pointLight position={[-3, -2, -4]} intensity={18} color="#725cf4" />
    <group ref={orbits}>
      <mesh rotation={[0.45, 0.1, 0.18]}><torusGeometry args={[2.2, 0.007, 5, 140]} /><meshBasicMaterial color="#69c9d4" transparent opacity={0.35} /></mesh>
      <mesh rotation={[1.12, 0.25, -0.4]}><torusGeometry args={[2.45, 0.005, 5, 140]} /><meshBasicMaterial color="#9981f2" transparent opacity={0.27} /></mesh>
      <mesh rotation={[-0.25, 0.65, 0.55]}><torusGeometry args={[1.72, 0.004, 5, 120]} /><meshBasicMaterial color="#4389a9" transparent opacity={0.32} /></mesh>
    </group>
    <group ref={object}>
      <mesh><icosahedronGeometry args={[0.77, 2]} /><meshStandardMaterial color="#102432" emissive="#0d7580" emissiveIntensity={1.3} roughness={0.27} metalness={0.36} wireframe /></mesh>
      <mesh><icosahedronGeometry args={[0.58, 2]} /><meshStandardMaterial color="#0c1722" emissive="#149ea5" emissiveIntensity={0.72} roughness={0.22} metalness={0.26} /></mesh>
      <mesh><sphereGeometry args={[0.19, 32, 24]} /><meshBasicMaterial color="#b1ffff" /></mesh>
      {concepts.map(point => <group key={point.id} position={point.position} onClick={event => { event.stopPropagation(); onSelect(point.id); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = "auto"; }}>
        <mesh><sphereGeometry args={[selected === point.id ? 0.105 : 0.075, 20, 18]} /><meshStandardMaterial color={point.color} emissive={point.color} emissiveIntensity={selected === point.id ? 1.1 : 0.55} roughness={0.2} metalness={0.22} /></mesh>
      </group>)}
    </group>
    <group ref={particleField}>
      {particles.map((point, index) => <mesh key={index} position={point}><sphereGeometry args={[index % 4 === 0 ? 0.025 : 0.014, 7, 6]} /><meshBasicMaterial color={index % 3 === 0 ? "#71bdfa" : "#82e5de"} transparent opacity={0.43} /></mesh>)}
    </group>
  </>;
}

export function InsightCore() {
  const [selectedId, setSelectedId] = useState("evidence");
  const [reducedMotion, setReducedMotion] = useState(false);
  const selected = concepts.find(item => item.id === selectedId) ?? concepts[0];

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return <div className="argus-core-visual">
    <div className="argus-core-label"><span><i />SYSTEM MAP</span><small>Current product capabilities</small></div>
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 7.5], fov: 39 }} gl={{ antialias: true, alpha: true }} frameloop={reducedMotion ? "demand" : "always"} fallback={<div className="argus-core-fallback">ARGUS maps sources, queries, lineage, and evidence in one workspace.</div>}>
      <CoreObject reducedMotion={reducedMotion} selected={selectedId} onSelect={setSelectedId} />
    </Canvas>
    <div className="argus-core-node-list" aria-label="Explore system map nodes">{concepts.map(point => {
      const Icon = point.icon;
      return <button key={point.id} type="button" className={point.id === selectedId ? "active" : ""} onClick={() => setSelectedId(point.id)} aria-pressed={point.id === selectedId} aria-label={`${point.name}: ${point.note}`}><Icon size={13} /><span>{point.name}</span></button>;
    })}</div>
    <div className="argus-core-caption" aria-live="polite"><strong>{selected.name}</strong><span>{selected.note}</span><ArrowUpRight size={14} /></div>
    <span className="argus-core-disclaimer">Interactive product map · not a live service topology</span>
  </div>;
}
