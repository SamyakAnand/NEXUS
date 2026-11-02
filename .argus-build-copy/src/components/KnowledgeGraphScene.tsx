"use client";

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import { ArrowClockwise, ArrowsOut, CaretDown, Graph, Info } from "@phosphor-icons/react";
import type { LineageEdge, LineageNode, LineageGraph } from "@/lib/api";

type Selection = { kind: "node"; item: LineageNode } | { kind: "edge"; item: LineageEdge } | null;

const tone: Record<LineageNode["type"], string> = {
  source: "#42d8d1", connector: "#758cff", dataset: "#5e98ff", cleaning: "#efb962",
  model: "#b89bff", analysis: "#6fc9a4", visualization: "#eb8ac1",
};

function positionsFor(nodes: LineageNode[]) {
  const radius = Math.max(2.4, Math.min(4, nodes.length * 0.17));
  return new Map(nodes.map((node, index) => {
    const n = nodes.length;
    const y = n <= 1 ? 0 : 1 - (index / (n - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    return [node.id, new Vector3(Math.cos(angle) * ring * radius, y * radius, Math.sin(angle) * ring * radius)] as const;
  }));
}

function GraphPoints({ graph, selectedId, onSelect }: { graph: LineageGraph; selectedId?: string; onSelect: (node: LineageNode) => void }) {
  const positions = useMemo(() => positionsFor(graph.nodes), [graph.nodes]);
  return <>
    <ambientLight intensity={0.75} />
    <pointLight position={[3, 4, 5]} intensity={30} color="#46b8ca" />
    <pointLight position={[-5, -2, -3]} intensity={12} color="#735bc7" />
    {graph.edges.map((edge, index) => {
      const from = positions.get(edge.source); const to = positions.get(edge.target);
      if (!from || !to) return null;
      return <Line key={`${edge.source}-${edge.target}-${index}`} points={[from, to]} color="#55728a" transparent opacity={0.43} lineWidth={1} />;
    })}
    {graph.nodes.map((node, index) => {
      const point = positions.get(node.id);
      if (!point) return null;
      const active = selectedId === node.id;
      const size = node.type === "source" ? 0.15 : node.type === "analysis" ? 0.19 : 0.13;
      return <group key={`${node.id}-${index}`} position={point} onClick={event => { event.stopPropagation(); onSelect(node); }} onPointerOver={event => { event.stopPropagation(); document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = "auto"; }}>
        {active && <mesh><sphereGeometry args={[size * 1.7, 18, 18]} /><meshBasicMaterial color={tone[node.type]} transparent opacity={0.2} /></mesh>}
        <mesh><sphereGeometry args={[size, 20, 18]} /><meshStandardMaterial color={tone[node.type]} emissive={tone[node.type]} emissiveIntensity={active ? 0.8 : 0.22} roughness={0.28} metalness={0.16} /></mesh>
      </group>;
    })}
    <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={4} maxDistance={13} enablePan />
  </>;
}

export function KnowledgeGraphScene({ graph }: { graph: LineageGraph }) {
  const [selection, setSelection] = useState<Selection>(null);
  const [focus, setFocus] = useState(false);
  const [filter, setFilter] = useState("");
  const boundedNodes = graph.nodes.slice(0, 60);
  const boundedIds = new Set(boundedNodes.map(node => node.id));
  const boundedEdges = graph.edges.filter(edge => boundedIds.has(edge.source) && boundedIds.has(edge.target));
  const boundedGraph = { nodes: boundedNodes, edges: boundedEdges };
  const nodeById = new Map(boundedNodes.map(node => [node.id, node]));
  const focusIds = selection?.kind === "node" ? new Set([
    selection.item.id,
    ...boundedEdges.filter(edge => edge.source === selection.item.id || edge.target === selection.item.id).flatMap(edge => [edge.source, edge.target]),
  ]) : undefined;
  const shownNodes = boundedNodes.filter(node => {
    const matches = `${node.label} ${node.type} ${node.id}`.toLowerCase().includes(filter.toLowerCase());
    return matches && (!focus || !focusIds || focusIds.has(node.id));
  });
  const visibleIds = new Set(shownNodes.map(node => node.id));
  const visibleEdges = boundedEdges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  const visibleGraph = { nodes: shownNodes, edges: visibleEdges };
  const selectedNeighbors = selection?.kind === "node"
    ? boundedEdges.filter(edge => edge.source === selection.item.id || edge.target === selection.item.id)
    : [];

  return <div className="argus-graph-layout">
    <section className="argus-graph-main" aria-label="Interactive knowledge graph">
      <div className="argus-graph-toolbar"><label><span className="sr-only">Filter graph nodes</span><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Find a node" /></label><button type="button" className={focus ? "selected" : ""} aria-pressed={focus} onClick={() => setFocus(value => !value)}><ArrowsOut size={15} /> Focus neighbors</button><button type="button" onClick={() => { setSelection(null); setFocus(false); setFilter(""); }}><ArrowClockwise size={15} /> Reset</button></div>
      <div className="argus-graph-canvas">
        <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 9], fov: 45 }} gl={{ antialias: true, alpha: true }} fallback={<p>WebGL is unavailable; use the node list below to inspect lineage.</p>}>
          <GraphPoints graph={visibleGraph} selectedId={selection?.kind === "node" ? selection.item.id : undefined} onSelect={item => setSelection({ kind: "node", item })} />
        </Canvas>
        <span className="argus-graph-hint"><Info size={13} /> Drag to orbit · scroll to zoom · select a node</span>
      </div>
      <div className="argus-graph-legend">{Object.entries(tone).map(([type, color]) => <span key={type}><i style={{ background: color }} />{type}</span>)}</div>
      <details className="argus-graph-node-list"><summary>Accessible node list <CaretDown size={13} /></summary><div>{shownNodes.map(node => <button type="button" key={node.id} onClick={() => setSelection({ kind: "node", item: node })}><i style={{ background: tone[node.type] }} />{node.label}<small>{node.type}</small></button>)}</div></details>
    </section>
    <aside className="argus-graph-inspector">
      <span className="argus-eyebrow">LINEAGE INSPECTOR</span>
      {selection?.kind === "node" ? <><i className="argus-inspector-dot" style={{ background: tone[selection.item.type] }} /><h2>{selection.item.label}</h2><span className="argus-type-chip">{selection.item.type}</span><p>{selection.item.type === "model" ? "This relationship is inferred from the configured lineage process; inspect its metadata before treating it as verified." : `This ${selection.item.type} node is present in the current source-lineage response.`}</p><dl>{Object.entries(selection.item.metadata).slice(0, 7).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>{selectedNeighbors.length > 0 && <div className="argus-neighbor-list"><strong>Connected relationships</strong>{selectedNeighbors.map((edge, index) => <button key={`${edge.source}-${edge.target}-${index}`} onClick={() => setSelection({ kind: "edge", item: edge })}><span>{nodeById.get(edge.source)?.label} → {nodeById.get(edge.target)?.label}</span><small>{edge.label || "relationship"}</small></button>)}</div>}</> : selection?.kind === "edge" ? <><h2>{nodeById.get(selection.item.source)?.label ?? selection.item.source} → {nodeById.get(selection.item.target)?.label ?? selection.item.target}</h2><span className="argus-type-chip">Relationship</span><p>{selection.item.label || "No relationship description was returned by the API."}</p><small className="argus-soft-note">The current lineage endpoint does not provide evidence citations for inferred relationships.</small></> : <div className="argus-graph-inspector-empty"><span><Graph size={22} /></span><strong>Select a node to inspect it</strong><p>Details come from the local source-lineage endpoint. This graph is not a document knowledge graph.</p></div>}
    </aside>
  </div>;
}
