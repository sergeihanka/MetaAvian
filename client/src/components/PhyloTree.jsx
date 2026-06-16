import React, { useRef, useEffect, useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import { useGame } from '../context/GameContext.jsx';
import { TEMPERATURE_COLORS } from '../config.js';

const ROW_HEIGHT = 90;
const MIN_NODE_WIDTH = 120;

// ─── Layout ─────────────────────────────────────────────────────────────────

function computeLayout(treeNodes, treeEdges, containerWidth) {
  if (!containerWidth || treeNodes.size === 0) return { positions: {}, totalHeight: ROW_HEIGHT };

  // NCBI depths can be large. Compress to sequential display rows.
  const depthSet = new Set();
  for (const [, node] of treeNodes) depthSet.add(node.depth ?? 0);
  const sortedDepths = Array.from(depthSet).sort((a, b) => a - b);
  const depthToRow = new Map(sortedDepths.map((d, i) => [d, i]));

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

  const totalHeight = sortedDepths.length * ROW_HEIGHT + ROW_HEIGHT / 2;
  return { positions, totalHeight };
}

// ─── Edges ──────────────────────────────────────────────────────────────────

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
        // Dashed for edges from Aves root (simplified path) or to mystery
        const dashed = parentId === 8782 || childId === 'mystery';
        return (
          <path
            key={`${parentId}->${childId}`}
            d={d}
            fill="none"
            stroke="#BDBDBD"
            strokeWidth={1.5}
            strokeDasharray={dashed ? '4 4' : 'none'}
          />
        );
      })}
    </>
  );
}

// ─── Wikipedia dialog ────────────────────────────────────────────────────────

function WikiDialog({ node, onClose }) {
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!node) return;
    setStatus('loading');
    setData(null);

    const term = node.name && node.name !== '?' ? node.name : node.commonName;

    fetch(`/api/v1/wiki?q=${encodeURIComponent(term)}`)
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then((d) => { setData(d); setStatus('ok'); })
      .catch(() => setStatus('error'));
  }, [node?.name]);

  const title = node
    ? `${node.name}${node.rank && node.rank !== 'unknown' ? ` · ${node.rank}` : ''}`
    : '';

  return (
    <Dialog
      open={!!node}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, mx: 2 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>{title}</DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {status === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {status === 'error' && (
          <Typography variant="body2" color="text.secondary">
            No Wikipedia article found for &ldquo;{node?.name}&rdquo;.
          </Typography>
        )}
        {status === 'ok' && data && (
          <>
            {data.thumbnail?.source && (
              <Box
                component="img"
                src={data.thumbnail.source}
                alt={data.title}
                sx={{
                  width: '100%',
                  maxHeight: 220,
                  objectFit: 'cover',
                  borderRadius: 2,
                  mb: 1.5,
                  display: 'block',
                }}
              />
            )}
            {data.description && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {data.description}
              </Typography>
            )}
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
              {data.extract}
            </Typography>
            {data.content_urls?.desktop?.page && (
              <Link
                href={data.content_urls.desktop.page}
                target="_blank"
                rel="noopener noreferrer"
                variant="caption"
                sx={{ display: 'block', mt: 1.5 }}
              >
                Read on Wikipedia →
              </Link>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} size="small">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Node ────────────────────────────────────────────────────────────────────

function TreeNode({ node, position, isNew, onClick }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
  }, []);

  if (!position) return null;

  const isRoot = node.taxId === 8782;
  const isLeaf = node.isLeaf;
  const isClickable = !!(onClick) && !(node.isMystery && !node.isRevealed);

  const chipSx = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    transform: `translate(-50%, -50%) ${mounted || !isNew ? '' : 'translateY(-20px)'}`,
    opacity: mounted || !isNew ? 1 : 0,
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    maxWidth: MIN_NODE_WIDTH + 60,
    cursor: isClickable ? 'pointer' : 'default',
    zIndex: 1,
  };

  // ── Aves root ──
  if (isRoot) {
    return (
      <Box sx={chipSx} onClick={isClickable ? () => onClick(node) : undefined}>
        <Chip
          label="Aves · class"
          color="primary"
          size="small"
          sx={{ fontWeight: 700, fontSize: '11px' }}
          aria-label="Root node: Aves class"
        />
      </Box>
    );
  }

  // ── Mystery / revealed answer ──
  if (node.isMystery) {
    const revealed = node.isRevealed;
    return (
      <Box
        sx={{ ...chipSx, textAlign: 'center' }}
        onClick={revealed && isClickable ? () => onClick(node) : undefined}
      >
        <Chip
          label={
            revealed
              ? <span style={{ fontWeight: 700, fontSize: '11px' }}>{node.commonName || node.name}</span>
              : <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: 1 }}>?</span>
          }
          size="small"
          sx={{
            bgcolor: revealed ? TEMPERATURE_COLORS.correct : 'transparent',
            color: revealed ? '#fff' : 'text.primary',
            fontWeight: 700,
            border: '2px dashed',
            borderColor: revealed ? TEMPERATURE_COLORS.correct : 'primary.main',
            height: 'auto',
            '& .MuiChip-label': { py: 0.5, px: 1 },
          }}
          aria-label={revealed ? `Answer: ${node.commonName}` : 'Mystery Bird'}
        />
        <Typography
          variant="caption"
          sx={{ display: 'block', fontSize: '9px', color: 'text.disabled', mt: 0.25, textAlign: 'center' }}
        >
          {revealed ? 'answer' : 'mystery'}
        </Typography>
      </Box>
    );
  }

  // ── Guess leaf ──
  if (isLeaf) {
    const color = TEMPERATURE_COLORS[node.feedbackTemperature] || TEMPERATURE_COLORS.cold;
    return (
      <Box sx={chipSx} onClick={isClickable ? () => onClick(node) : undefined}>
        <Chip
          label={node.commonName || node.name}
          size="small"
          sx={{
            bgcolor: color,
            color: '#fff',
            fontWeight: 600,
            fontSize: '11px',
            maxWidth: MIN_NODE_WIDTH + 60,
          }}
          aria-label={`Guessed bird: ${node.commonName || node.name}`}
        />
      </Box>
    );
  }

  // ── Internal node: LCA or hint ──
  const isHint = node.isHint;
  return (
    <Box sx={chipSx} onClick={isClickable ? () => onClick(node) : undefined}>
      <Chip
        label={
          <span>
            <span style={{ display: 'block', fontWeight: 700, fontSize: '11px', lineHeight: 1.3 }}>
              {node.name}
            </span>
            {node.rank && node.rank !== 'unknown' && (
              <span style={{ display: 'block', fontSize: '9px', opacity: 0.75, lineHeight: 1.2 }}>
                {node.rank}
              </span>
            )}
          </span>
        }
        variant="outlined"
        size="small"
        sx={{
          bgcolor: 'background.paper',
          maxWidth: MIN_NODE_WIDTH + 60,
          height: 'auto',
          borderColor: isHint ? '#169A43' : 'divider',
          borderWidth: isHint ? 2 : 1,
          '& .MuiChip-label': { py: 0.5, px: 1, whiteSpace: 'normal' },
        }}
        aria-label={`${node.rank || 'taxon'}: ${node.name}`}
      />
    </Box>
  );
}

// ─── PhyloTree ───────────────────────────────────────────────────────────────

export default function PhyloTree() {
  const { state } = useGame();
  const { treeNodes, treeEdges, guesses } = state;
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [newNodeIds, setNewNodeIds] = useState(new Set());
  const [wikiNode, setWikiNode] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    setContainerWidth(containerRef.current.offsetWidth);
    return () => observer.disconnect();
  }, []);

  const prevNodeCount = useRef(treeNodes.size);
  useEffect(() => {
    if (treeNodes.size > prevNodeCount.current) {
      const allIds = Array.from(treeNodes.keys());
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
    <>
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

            {Array.from(treeNodes.entries()).map(([taxId, node]) => (
              <TreeNode
                key={taxId}
                node={node}
                position={positions[taxId]}
                isNew={newNodeIds.has(taxId)}
                onClick={setWikiNode}
              />
            ))}
          </Box>
        )}
      </Box>

      <WikiDialog node={wikiNode} onClose={() => setWikiNode(null)} />
    </>
  );
}
