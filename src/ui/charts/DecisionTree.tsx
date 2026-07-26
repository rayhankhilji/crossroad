/**
 * The decision tree.
 *
 * Probability mass, flowing left to right. One node for today, one for each
 * option, and then the futures each option opens up — drawn as ribbons whose
 * width is how often that future actually happened across the simulation.
 *
 * The form is doing real work. A conventional tree with equal-weight edges
 * quietly implies the branches are equally likely, which is the single most
 * misleading thing a decision diagram can do. Widths here are probabilities,
 * so a 2% breakout is a thread and a 70% failure is a rope, and the shape of
 * the choice is visible before a single number is read.
 *
 * The animation is not decoration: the ribbons grow in sequence so you watch
 * the futures being allocated rather than arriving pre-formed.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';

import type { ArchetypeShare } from '../../engine/archetypes';
import { branchPalette, Figure, TONE_COLOURS, useSize } from './kit';

export interface TreeBranch {
  branchId: string;
  label: string;
  tagline: string;
  archetypes: ArchetypeShare[];
}

interface Ribbon {
  key: string;
  path: string;
  colour: string;
  opacity: number;
  archetypeId: string;
  branchId: string;
}

interface NodeBox {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sub?: string;
  colour: string;
  branchId: string;
  archetypeId?: string;
}

export function DecisionTree({
  branches,
  baselineId,
  question,
  format,
  height = 520,
}: {
  branches: TreeBranch[];
  baselineId: string;
  question: string;
  format: (value: number) => string;
  height?: number;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hovered, setHovered] = useState<string | null>(null);

  const width = Math.max(560, size.width);
  const padding = { top: 24, bottom: 24, left: 8, right: 8 };
  const plotHeight = height - padding.top - padding.bottom;

  const rootWidth = 96;
  const branchWidth = 132;
  const leafWidth = Math.min(240, Math.max(150, width * 0.26));
  const gap = (width - padding.left - padding.right - rootWidth - branchWidth - leafWidth) / 2;

  const rootX = padding.left;
  const branchX = rootX + rootWidth + gap;
  const leafX = branchX + branchWidth + gap;

  const palette = useMemo(
    () => branchPalette(branches.map((b) => b.branchId), baselineId),
    [branches, baselineId],
  );

  const { nodes, ribbons } = useMemo(() => {
    const nodes: NodeBox[] = [];
    const ribbons: Ribbon[] = [];

    // Options are alternatives, not a probability split, so each gets an equal
    // share of the vertical space. Within an option, futures are sized by how
    // often they actually occurred.
    const branchGap = 26;
    const branchHeight = (plotHeight - branchGap * (branches.length - 1)) / branches.length;

    nodes.push({
      key: 'root',
      x: rootX,
      y: padding.top,
      width: rootWidth,
      height: plotHeight,
      label: 'Today',
      colour: 'var(--ink-faint)',
      branchId: '',
    });

    branches.forEach((branch, bi) => {
      const branchY = padding.top + bi * (branchHeight + branchGap);
      const colour = palette[branch.branchId];

      nodes.push({
        key: `branch-${branch.branchId}`,
        x: branchX,
        y: branchY,
        width: branchWidth,
        height: branchHeight,
        label: branch.label,
        sub: branch.tagline,
        colour,
        branchId: branch.branchId,
      });

      ribbons.push({
        key: `root-${branch.branchId}`,
        path: ribbonPath(
          rootX + rootWidth,
          padding.top + (bi * plotHeight) / branches.length,
          padding.top + ((bi + 1) * plotHeight) / branches.length,
          branchX,
          branchY,
          branchY + branchHeight,
        ),
        colour,
        opacity: 0.14,
        archetypeId: '',
        branchId: branch.branchId,
      });

      // Futures with almost no mass are folded into a single row rather than
      // rendered as sub-pixel slivers that cannot be read or hovered.
      const visible = branch.archetypes.filter((a) => a.share >= 0.015);
      const remainder = branch.archetypes.filter((a) => a.share < 0.015);
      const remainderShare = remainder.reduce((sum, a) => sum + a.share, 0);

      const rows: { id: string; label: string; share: number; tone: string; sub: string }[] = visible.map((a) => ({
        id: a.id,
        label: a.label,
        share: a.share,
        tone: a.tone,
        sub: format(a.medianNetWorth),
      }));
      if (remainderShare > 0.001) {
        rows.push({
          id: '__other',
          label: 'Rarer futures',
          share: remainderShare,
          tone: 'mixed',
          sub: `${remainder.length} more`,
        });
      }

      const leafGap = 3;
      const available = branchHeight - leafGap * Math.max(0, rows.length - 1);
      let cursor = branchY;
      let sourceCursor = branchY;

      for (const row of rows) {
        const rowHeight = Math.max(9, available * row.share);
        const toneColour = TONE_COLOURS[row.tone] ?? colour;

        ribbons.push({
          key: `${branch.branchId}-${row.id}`,
          path: ribbonPath(
            branchX + branchWidth,
            sourceCursor,
            sourceCursor + rowHeight,
            leafX,
            cursor,
            cursor + rowHeight,
          ),
          colour: toneColour,
          opacity: 0.3,
          archetypeId: row.id,
          branchId: branch.branchId,
        });

        nodes.push({
          key: `leaf-${branch.branchId}-${row.id}`,
          x: leafX,
          y: cursor,
          width: leafWidth,
          height: rowHeight,
          label: row.label,
          sub: `${(row.share * 100).toFixed(row.share < 0.1 ? 1 : 0)}%`,
          colour: toneColour,
          branchId: branch.branchId,
          archetypeId: row.id,
        });

        cursor += rowHeight + leafGap;
        sourceCursor += rowHeight;
      }
    });

    return { nodes, ribbons };
  }, [branches, palette, plotHeight, rootX, branchX, leafX, rootWidth, branchWidth, leafWidth, padding.top, format]);

  const hoveredNode = nodes.find((n) => n.key === hovered);

  return (
    <Figure
      title="Every future this choice opens"
      caption="Ribbon width is probability. These are the shapes the ten thousand simulated futures actually fell into — not illustrative branches."
      height={height}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th>Option</th>
              <th>Future</th>
              <th>Probability</th>
              <th>Median net worth</th>
              <th>Median wellbeing</th>
            </tr>
          </thead>
          <tbody>
            {branches.flatMap((branch) =>
              branch.archetypes.map((a) => (
                <tr key={`${branch.branchId}-${a.id}`}>
                  <td>{branch.label}</td>
                  <td>{a.label}</td>
                  <td className="num">{(a.share * 100).toFixed(1)}%</td>
                  <td className="num">{format(a.medianNetWorth)}</td>
                  <td className="num">{a.medianHappiness.toFixed(1)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="chart-surface tree">
        <svg width="100%" height={height} role="img" aria-label={`Decision tree for: ${question}`}>
          {/*
            The ribbons fade in individually rather than being revealed behind
            a sweeping clip path. A clip is prettier for about a second and has
            a nasty failure mode: if the animation is interrupted — a throttled
            background tab, a slow frame — half the chart is simply not there.
            A fade that stalls leaves the data drawn, just faint.
          */}
          <g>
            {ribbons.map((ribbon, ri) => {
              const dim = hovered !== null && hoveredNode?.archetypeId !== undefined
                ? !(ribbon.archetypeId === hoveredNode.archetypeId && ribbon.branchId === hoveredNode.branchId)
                : hovered !== null && hoveredNode?.branchId
                  ? ribbon.branchId !== hoveredNode.branchId
                  : false;
              return (
                <g
                  key={ribbon.key}
                  className="chart-reveal"
                  style={{ animationDelay: `${Math.min(0.7, ri * 0.035)}s` }}
                >
                  <path
                    d={ribbon.path}
                    fill={ribbon.colour}
                    opacity={dim ? 0.06 : ribbon.opacity}
                    style={{ transition: 'opacity 0.25s var(--ease)' }}
                  />
                </g>
              );
            })}
          </g>

          {nodes.map((node, i) => {
            const isLeaf = node.archetypeId !== undefined;
            const isHovered = hovered === node.key;
            const dim =
              hovered !== null &&
              !isHovered &&
              hoveredNode?.branchId !== undefined &&
              node.branchId !== hoveredNode.branchId &&
              node.key !== 'root';

            return (
              <motion.g
                key={node.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: dim ? 0.35 : 1, x: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.12 + i * 0.022 }}
                onPointerEnter={() => setHovered(node.key)}
                onPointerLeave={() => setHovered(null)}
                style={{ cursor: isLeaf ? 'pointer' : 'default' }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={Math.min(6, node.height / 2)}
                  fill={node.key === 'root' ? 'var(--surface-2)' : `color-mix(in srgb, ${node.colour} 16%, var(--surface-1))`}
                  stroke={isHovered ? node.colour : 'var(--line)'}
                  strokeWidth={isHovered ? 1.5 : 1}
                />
                <rect
                  x={node.x}
                  y={node.y}
                  width={3}
                  height={node.height}
                  rx={1.5}
                  fill={node.colour}
                  opacity={node.key === 'root' ? 0.3 : 0.9}
                />
                {node.height >= 20 && (
                  <text className="tree__label" x={node.x + 12} y={node.y + node.height / 2 + (node.sub && node.height > 38 ? -3 : 4)}>
                    {truncate(node.label, Math.floor((node.width - 20) / 6.4))}
                  </text>
                )}
                {node.sub && node.height > 38 && (
                  <text className="tree__sub" x={node.x + 12} y={node.y + node.height / 2 + 13}>
                    {truncate(node.sub, Math.floor((node.width - 20) / 5.6))}
                  </text>
                )}
                {isLeaf && node.height < 38 && node.height >= 20 && (
                  <text className="tree__sub tree__sub--inline" x={node.x + node.width - 10} y={node.y + node.height / 2 + 4} textAnchor="end">
                    {node.sub}
                  </text>
                )}
              </motion.g>
            );
          })}
        </svg>

        <AnimatePresence>
          {hoveredNode?.archetypeId && hoveredNode.archetypeId !== '__other' && (
            <ArchetypeCard
              node={hoveredNode}
              branches={branches}
              format={format}
              containerWidth={width}
            />
          )}
        </AnimatePresence>
      </div>
    </Figure>
  );
}

function ArchetypeCard({
  node,
  branches,
  format,
  containerWidth,
}: {
  node: NodeBox;
  branches: TreeBranch[];
  format: (value: number) => string;
  containerWidth: number;
}) {
  const branch = branches.find((b) => b.branchId === node.branchId);
  const archetype = branch?.archetypes.find((a) => a.id === node.archetypeId);
  if (!archetype) return null;

  const left = Math.min(node.x, containerWidth - 300);

  return (
    <motion.div
      className="tree__card"
      style={{ left: Math.max(8, left), top: Math.max(8, node.y + node.height + 10) }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16 }}
    >
      <div className="tree__card-head">
        <span className="tree__card-dot" style={{ background: node.colour }} />
        {archetype.label}
        <span className="tree__card-share num">{(archetype.share * 100).toFixed(1)}%</span>
      </div>
      <p className="tree__card-body">{archetype.description}</p>
      <div className="tree__card-stats">
        <div>
          <span className="tree__card-key">Median net worth</span>
          <span className="num">{format(archetype.medianNetWorth)}</span>
        </div>
        <div>
          <span className="tree__card-key">Wellbeing</span>
          <span className="num">{archetype.medianHappiness.toFixed(1)}</span>
        </div>
        <div>
          <span className="tree__card-key">Health</span>
          <span className="num">{archetype.medianHealth.toFixed(0)}</span>
        </div>
      </div>
    </motion.div>
  );
}

/** A ribbon between two vertical spans, with horizontal-tangent bezier sides. */
function ribbonPath(x0: number, y0Top: number, y0Bottom: number, x1: number, y1Top: number, y1Bottom: number): string {
  const cx0 = x0 + (x1 - x0) * 0.5;
  const cx1 = x1 - (x1 - x0) * 0.5;
  return [
    `M${x0},${y0Top}`,
    `C${cx0},${y0Top} ${cx1},${y1Top} ${x1},${y1Top}`,
    `L${x1},${y1Bottom}`,
    `C${cx1},${y1Bottom} ${cx0},${y0Bottom} ${x0},${y0Bottom}`,
    'Z',
  ].join(' ');
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}
