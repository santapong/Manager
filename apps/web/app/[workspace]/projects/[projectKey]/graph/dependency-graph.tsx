"use client";

// Client component — interactive plain SVG layered layout. Self node is centered;
// upstream nodes (others -> self) go left, downstream (self -> others) go right.
// Clicking a node navigates to that project; clicking an edge reveals its type.

import { useRouter } from "next/navigation";
import { useState } from "react";

type Node = { id: string; key: string; name: string; self: boolean };
type Edge = { id: string; from: string; to: string; type: "depends_on" | "relates" };

const NODE_W = 160;
const NODE_H = 56;
const COL_GAP = 220;
const ROW_GAP = 80;

export function DependencyGraph({
  workspaceSlug,
  selfId,
  nodes,
  edges,
}: {
  workspaceSlug: string;
  selfId: string;
  nodes: Node[];
  edges: Edge[];
}) {
  const router = useRouter();
  const [activeEdge, setActiveEdge] = useState<Edge | null>(null);

  const upstream = nodes.filter(
    (n) => !n.self && edges.some((e) => e.to === selfId && e.from === n.id),
  );
  const downstream = nodes.filter(
    (n) => !n.self && edges.some((e) => e.from === selfId && e.to === n.id),
  );
  // anything else with `relates` type with self
  const sidecar = nodes.filter(
    (n) =>
      !n.self &&
      !upstream.includes(n) &&
      !downstream.includes(n),
  );

  // Layout columns: upstream (col 0), self (col 1), downstream (col 2),
  // sidecar appended below self.
  const positions = new Map<string, { x: number; y: number }>();
  layoutColumn(upstream, 0, positions);
  positions.set(selfId, { x: COL_GAP, y: centerY(Math.max(upstream.length, downstream.length, 1)) });
  layoutColumn(downstream, 2, positions);
  // sidecar nodes stack under self at column 1
  sidecar.forEach((n, i) => {
    positions.set(n.id, { x: COL_GAP, y: centerY(1) + ROW_GAP * (i + 1) });
  });

  const allY = Array.from(positions.values()).map((p) => p.y);
  const maxY = Math.max(NODE_H, ...allY) + NODE_H + 20;
  const width = COL_GAP * 2 + NODE_W + 20;

  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="Project dependency graph"
        viewBox={`0 0 ${width} ${maxY}`}
        width={width}
        height={maxY}
        className="rounded-md border border-gray-200 bg-white"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
          </marker>
        </defs>

        {edges.map((e) => {
          const a = positions.get(e.from);
          const b = positions.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x;
          const y2 = b.y + NODE_H / 2;
          const isActive = activeEdge?.id === e.id;
          return (
            <g key={e.id}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isActive ? "#4a5af0" : "#9ca3af"}
                strokeWidth={isActive ? 2 : 1.25}
                strokeDasharray={e.type === "relates" ? "4 3" : undefined}
                markerEnd="url(#arrow)"
                onClick={() => setActiveEdge(e)}
                className="cursor-pointer"
              />
              {/* invisible thicker hit area */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth={12}
                onClick={() => setActiveEdge(e)}
                className="cursor-pointer"
              />
            </g>
          );
        })}

        {nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          return (
            <g
              key={n.id}
              transform={`translate(${p.x}, ${p.y})`}
              onClick={() => {
                if (n.self) return;
                router.push(`/${workspaceSlug}/projects/${n.key}/graph`);
              }}
              className={n.self ? "" : "cursor-pointer"}
              tabIndex={n.self ? -1 : 0}
              onKeyDown={(e) => {
                if (n.self) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/${workspaceSlug}/projects/${n.key}/graph`);
                }
              }}
              role={n.self ? "img" : "link"}
              aria-label={n.self ? `This project: ${n.key} ${n.name}` : `Open project ${n.key}`}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                ry={8}
                fill={n.self ? "#eef2ff" : "#ffffff"}
                stroke={n.self ? "#4a5af0" : "#d1d5db"}
                strokeWidth={n.self ? 2 : 1}
              />
              <text
                x={12}
                y={22}
                fontSize="11"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
                fill="#6b7280"
              >
                {n.key}
              </text>
              <text x={12} y={42} fontSize="13" fontWeight="600" fill="#111827">
                {truncate(n.name, 20)}
              </text>
            </g>
          );
        })}
      </svg>

      {activeEdge ? (
        <p className="mt-2 text-sm text-gray-700">
          Edge type:{" "}
          <span className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-xs text-brand-700">
            {activeEdge.type}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-xs text-gray-500">Click an edge to see its type.</p>
      )}
    </div>
  );
}

function layoutColumn(
  nodes: Node[],
  col: 0 | 2,
  positions: Map<string, { x: number; y: number }>,
) {
  const x = col === 0 ? 10 : COL_GAP * 2 + 10;
  nodes.forEach((n, i) => {
    positions.set(n.id, { x, y: 20 + i * ROW_GAP });
  });
}

function centerY(maxRows: number) {
  return 20 + ((maxRows - 1) * ROW_GAP) / 2;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
