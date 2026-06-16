import React, { useRef, useEffect, useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { useGame } from '../context/GameContext.jsx';
import { TEMPERATURE_COLORS } from '../config.js';

const ROW_HEIGHT = 90;
const MIN_NODE_WIDTH = 120;
const NODE_HEIGHT = 36;

function computeLayout(treeNodes, treeEdges, containerWidth) {
  if (!containerWidth || treeNodes.size === 0) return { positions: {}, totalHeight: ROW_HEIGHT };

  // NCBI depths can be large (up to 20+). Compress to display rows by sorting
  // unique actual depths and mapping them to sequential row indices.
  const depthSet = new Set();
  for (const [, node] of treeNodes) depthSet.add(node.depth ?? 0);
  const sortedDepths = Array.from(depthSet).sort((a, b) => a - b);
  const depthToRow = new Map(sortedDepths.map((d, i) => [d, i]));

  // Group nodes by display row
  const byRow = new Map();
  for (const [taxId, node] of treeNodes) {
    const row = depthToRow.get(node.depth ?? 0) ?? 0;
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push({ taxId, ...node });
  }

  const positions = {};
  for (const [row, rowNodes] of byRow) {
    rowNodes.forEach((node, idx) => {
      const x =
        rowNodes.length === 1
          ? containerWidth / 2
          : ((idx + 1) / (rowNodes.length + 1)) * containerWidth;
      const y = row * ROW_HEIGHT + ROW_HEIGHT / 2;
      positions[node.taxId] = { x, y };
    });
  }

  const numRows = sortedDepths.length;
  const totalHeight = numRows * ROW_HEIGHT + ROW_HEIGHT / 2;
  return { positions, totalHeight };
}

function TreeEdges({ treeEdges, positions }) {
  if (!positions || treeEdges.length === 0) return null;

  return (
    <>
      {treeEdges.map(({ parentId, childId }) => {
        const p = positions[parentId];
        const c = positions[childId];
        if (!p || !c) return null;
        const yMid = (p.y + c.y) / 2;
        const d = `M ${p.x},${p.y} C ${p.x},${yMid} ${c.x},${yMid} ${c.x},${c.y}`;
        return (
          <path
            key={`${parentId}->${childId}`}
            d={d}
            fill="none"
            stroke="#BDBDBD"
            strokeWidth={1.5}
            strokeDasharray={parentId === 8782 ? '4 4' : 'none'}
          />
        );
      })}
    </>
  );
}

function TreeNode({ node, position, isNew }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger animation on mount
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setMounted(true));
    });
  }, []);

  if (!position) return null;

  const isRoot = node.taxId === 8782;
  const isLeaf = node.isLeaf;
  const color = isLeaf
    ? TEMPERATURE_COLORS[node.feedbackTemperature] || TEMPERATURE_COLORS.cold
    : null;

  let chipSx = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    transform: `translate(-50%, -50%) ${mounted || !isNew ? '' : 'translateY(-20px)'}`,
    opacity: mounted || !isNew ? 1 : 0,
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    maxWidth: MIN_NODE_WIDTH + 40,
    cursor: 'default',
    zIndex: 1,
  };

  if (isRoot) {
    return (
      <Box sx={chipSx}>
        <Chip
          label="Aves (Class)"
          color="primary"
          size="small"
          sx={{ fontWeight: 700, fontSize: '11px' }}
          aria-label="Root node: Aves class"
        />
      </Box>
    );
  }

  if (node.isMystery) {
    const revealed = node.isRevealed;
    return (
      <Box sx={{ ...chipSx, textAlign: 'center' }}>
        <Chip
          label={revealed ? (node.commonName || node.name) : '?'}
          size="small"
          sx={{
            bgcolor: revealed ? TEMPERATURE_COLORS.correct : 'transparent',
            color: revealed ? '#fff' : 'text.primary',
            fontWeight: 700,
            fontSize: '11px',
            border: '2px dashed',
            borderColor: revealed ? TEMPERATURE_COLORS.correct : 'primary.main',
          }}
          aria-label={revealed ? `Answer: ${node.commonName}` : 'Mystery Bird'}
        />
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontSize: '9px',
            color: 'text.disabled',
            mt: 0.25,
            position: 'absolute',
            width: '100%',
            left: 0,
            textAlign: 'center',
            top: '100%',
          }}
        >
          mystery
        </Typography>
      </Box>
    );
  }

  if (isLeaf) {
    return (
      <Box sx={chipSx}>
        <Chip
          label={node.commonName || node.name}
          size="small"
          sx={{
            bgcolor: color,
            color: '#fff',
            fontWeight: 600,
            fontSize: '11px',
            maxWidth: MIN_NODE_WIDTH + 40,
          }}
          aria-label={`Guessed bird: ${node.commonName || node.name}`}
        />
      </Box>
    );
  }

  // Internal node (LCA or ancestor)
  return (
    <Box sx={{ ...chipSx, textAlign: 'center' }}>
      <Chip
        label={node.name}
        variant="outlined"
        size="small"
        sx={{ fontSize: '11px', bgcolor: 'background.paper', maxWidth: MIN_NODE_WIDTH + 40 }}
        aria-label={`${node.rank || 'taxon'}: ${node.name}`}
      />
      {node.rank && node.rank !== 'unknown' && (
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontSize: '9px',
            color: 'text.disabled',
            mt: 0.25,
            position: 'absolute',
            width: '100%',
            left: 0,
            textAlign: 'center',
            top: '100%',
          }}
        >
          {node.rank}
        </Typography>
      )}
    </Box>
  );
}

export default function PhyloTree() {
  const { state } = useGame();
  const { treeNodes, treeEdges, guesses } = state;
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [newNodeIds, setNewNodeIds] = useState(new Set());

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    setContainerWidth(containerRef.current.offsetWidth);
    return () => observer.disconnect();
  }, []);

  // Track new nodes for animation
  const prevNodeCount = useRef(treeNodes.size);
  useEffect(() => {
    if (treeNodes.size > prevNodeCount.current) {
      const allIds = Array.from(treeNodes.keys());
      // Mark newest nodes (those added since last render) as new
      setNewNodeIds(new Set(allIds.slice(prevNodeCount.current)));
      prevNodeCount.current = treeNodes.size;
    }
  }, [treeNodes.size]);

  const { positions, totalHeight } = useMemo(
    () => computeLayout(treeNodes, treeEdges, containerWidth),
    [treeNodes, treeEdges, containerWidth]
  );

  const noGuesses = guesses.length === 0;

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        minHeight: 160,
        bgcolor: 'background.default',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
      }}
      aria-label="Phylogenetic tree visualization"
      role="img"
    >
      {noGuesses ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 160,
            color: 'text.disabled',
            px: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="body2">
            Make your first guess to start building the tree!
          </Typography>
        </Box>
      ) : (
        <Box sx={{ position: 'relative', width: '100%', height: totalHeight }}>
          {/* SVG layer for edges */}
          <Box
            component="svg"
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          >
            <TreeEdges treeEdges={treeEdges} positions={positions} />
          </Box>

          {/* Node layer */}
          {Array.from(treeNodes.entries()).map(([taxId, node]) => (
            <TreeNode
              key={taxId}
              node={node}
              position={positions[taxId]}
              isNew={newNodeIds.has(taxId)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
