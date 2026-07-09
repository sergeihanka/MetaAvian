import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { useGame } from '../context/GameContext.jsx';
import { TEMPERATURE_COLORS } from '../config.js';

const ROW_HEIGHT = 90;
const MIN_NODE_WIDTH = 120;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
// Minimum horizontal room each node on a row gets, so crowded rows (many
// classes/families) spread out and stop overlapping instead of being squeezed
// into the container width. Rows wider than the container scroll horizontally.
const NODE_SLOT = MIN_NODE_WIDTH + 50;

// ─── Layout ─────────────────────────────────────────────────────────────────

function computeLayout(treeNodes, treeEdges, containerWidth) {
  if (!containerWidth || treeNodes.size === 0) return { positions: {}, totalHeight: ROW_HEIGHT, totalWidth: containerWidth };

  const rowH = ROW_HEIGHT;

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

  // Width is driven by the busiest row: give every node at least NODE_SLOT of
  // horizontal space, but never shrink below the visible container width.
  let maxRowCount = 1;
  for (const [, rowNodes] of byRow) maxRowCount = Math.max(maxRowCount, rowNodes.length);
  const w = Math.max(containerWidth, maxRowCount * NODE_SLOT);

  const positions = {};
  for (const [row, rowNodes] of byRow) {
    rowNodes.forEach((node, idx) => {
      const x =
        rowNodes.length === 1
          ? w / 2
          : ((idx + 1) / (rowNodes.length + 1)) * w;
      const y = row * rowH + rowH / 2;
      positions[node.taxId] = { x, y };
    });
  }

  const totalHeight = sortedDepths.length * rowH + rowH / 2;
  return { positions, totalHeight, totalWidth: w };
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
  const [related, setRelated] = useState(null); // { related[], matchedOn, groupName }
  const [customTerm, setCustomTerm] = useState(null); // set when user taps a related bird

  const baseTerm = node?.name && node.name !== '?' ? node.name : node?.commonName;
  const term = customTerm ?? baseTerm;

  // Reset custom navigation whenever the underlying node changes
  useEffect(() => {
    setCustomTerm(null);
    setRelated(null);
  }, [node?.name]);

  // Fetch wiki whenever term changes
  useEffect(() => {
    if (!term) return;
    setStatus('loading');
    setData(null);
    setRelated(null);

    fetch(`/api/v1/wiki?q=${encodeURIComponent(term)}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setData(d); setStatus('ok'); })
      .catch(() => {
        setStatus('error');
        // Fetch related birds from aviary.allbirds via server
        fetch(`/api/v1/wiki/related?name=${encodeURIComponent(term)}`)
          .then((r) => r.json())
          .then((d) => setRelated(d))
          .catch(() => setRelated({ related: [] }));
      });
  }, [term]);

  const displayTitle = customTerm
    ? customTerm
    : node
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
      <DialogTitle sx={{ fontWeight: 700, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        {customTerm && (
          <Button
            size="small"
            onClick={() => { setCustomTerm(null); setRelated(null); }}
            sx={{ minWidth: 0, p: 0.5, mr: 0.5 }}
          >
            ←
          </Button>
        )}
        {displayTitle}
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        {status === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {status === 'error' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: related?.related?.length ? 2 : 0 }}>
              No Wikipedia article found for &ldquo;{term}&rdquo;.
            </Typography>

            {related === null && (
              <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
                <CircularProgress size={20} />
              </Box>
            )}

            {related?.related?.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Related birds{related.groupName ? ` · ${related.groupName}` : ''}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {related.related.map((b) => (
                    <Chip
                      key={b.commonName}
                      label={b.commonName}
                      size="small"
                      onClick={() => setCustomTerm(b.commonName)}
                      clickable
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {status === 'ok' && data && (
          <>
            {data.thumbnail?.source && (
              <Box sx={{ width: '100%', height: 220, borderRadius: 2, mb: 1.5, overflow: 'hidden' }}>
                <Box
                  component="img"
                  src={data.thumbnail.source}
                  alt={data.title}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </Box>
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

  // Horizontal spread: the node's base x (zoom=1) is pushed to x * zx by the
  // current zoom factor (--zx, inherited from the layer). The label box itself
  // is NOT scaled, so zooming pulls crowded nodes apart instead of magnifying.
  const spread = 'translateX(calc(var(--nx) * (var(--zx, 1) - 1) * 1px))';
  const entrance = mounted || !isNew ? '' : 'translateY(-20px)';

  const chipSx = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    '--nx': position.x,
    transform: `translate(-50%, -50%) ${spread} ${entrance}`,
    opacity: mounted || !isNew ? 1 : 0,
    transition: 'opacity 0.3s ease, transform var(--tdur, 0.18s) ease-out',
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

  // ── Internal node: LCA, hint, or a ruled-out genus ──
  // A guess's genus is a dead end — it is not on the mystery bird's lineage —
  // so it reads as struck-through rather than as part of the spine.
  const isHint = node.isHint;
  const isRuledOut = node.isGuessGenus;
  return (
    <Box sx={chipSx} onClick={isClickable ? () => onClick(node) : undefined}>
      <Chip
        label={
          <span>
            <span
              style={{
                display: 'block',
                fontWeight: 700,
                fontSize: '11px',
                lineHeight: 1.3,
                fontStyle: isRuledOut ? 'italic' : 'normal',
              }}
            >
              {node.name}
            </span>
            {node.rank && node.rank !== 'unknown' && (
              <span style={{ display: 'block', fontSize: '9px', opacity: 0.75, lineHeight: 1.2 }}>
                {isRuledOut ? `${node.rank} · ruled out` : node.rank}
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
          ...(isRuledOut && {
            borderStyle: 'dashed',
            color: 'text.secondary',
          }),
          '& .MuiChip-label': { py: 0.5, px: 1, whiteSpace: 'normal' },
        }}
        aria-label={
          isRuledOut
            ? `Ruled out ${node.rank}: ${node.name}`
            : `${node.rank || 'taxon'}: ${node.name}`
        }
      />
    </Box>
  );
}

// ─── Declutter ───────────────────────────────────────────────────────────────
// Collapses "passthrough" nodes — internal nodes with exactly one child that
// are not hints, not leaves, and not the mystery node. Branch points and all
// meaningful revealed nodes are always kept.

function computeDeclutteredTree(treeNodes, treeEdges) {
  const childrenOf = new Map();
  for (const [id] of treeNodes) childrenOf.set(id, []);
  for (const { parentId, childId } of treeEdges) {
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId).push(childId);
  }

  const isPassthrough = (id) => {
    const node = treeNodes.get(id);
    if (!node) return false;
    if (id === 8782) return false;        // Aves root always shown
    if (node.isHint) return false;        // hints are meaningful, keep them
    if (node.isGuessGenus) return false;  // the rank players eliminate at
    if (node.isLeaf) return false;        // guess leaves always shown
    if (node.isMystery) return false;     // mystery always shown
    return (childrenOf.get(id) || []).length === 1;
  };

  const filteredNodes = new Map();
  for (const [id, node] of treeNodes) {
    if (!isPassthrough(id)) filteredNodes.set(id, node);
  }

  // For each kept node, skip passthrough nodes to find real children
  const getNonPassthroughChildren = (id) => {
    const result = [];
    const queue = [...(childrenOf.get(id) || [])];
    while (queue.length > 0) {
      const cid = queue.shift();
      if (!isPassthrough(cid)) {
        result.push(cid);
      } else {
        queue.push(...(childrenOf.get(cid) || []));
      }
    }
    return result;
  };

  const filteredEdges = [];
  const seen = new Set();
  for (const [id] of filteredNodes) {
    for (const childId of getNonPassthroughChildren(id)) {
      const key = `${id}->${childId}`;
      if (!seen.has(key)) { seen.add(key); filteredEdges.push({ parentId: id, childId }); }
    }
  }

  return { nodes: filteredNodes, edges: filteredEdges };
}

// ─── PhyloTree ───────────────────────────────────────────────────────────────

export default function PhyloTree() {
  const { state } = useGame();
  const { treeNodes, treeEdges, guesses } = state;
  const [containerWidth, setContainerWidth] = useState(0);
  const [newNodeIds, setNewNodeIds] = useState(new Set());
  const [wikiNode, setWikiNode] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [declutter, setDeclutter] = useState(false);

  // Imperative zoom refs — the gesture mutates the DOM directly (GPU-composited
  // CSS transform) for native-smooth 60fps pinch, then commits to React state
  // once on touchend so scroll bounds and button state stay consistent.
  const scrollRef = useRef(null);   // scroll container
  const sizerRef = useRef(null);    // scrollable area; holds --zx spread factor
  const zoomRef = useRef(1);
  const gestureRef = useRef(null);  // { startDist, startZoom } during a pinch

  useEffect(() => {
    if (!scrollRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(scrollRef.current);
    setContainerWidth(scrollRef.current.clientWidth);
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

  const { nodes: displayNodes, edges: displayEdges } = useMemo(() => {
    if (!declutter) return { nodes: treeNodes, edges: treeEdges };
    return computeDeclutteredTree(treeNodes, treeEdges);
  }, [treeNodes, treeEdges, declutter]);

  const { positions, totalHeight, totalWidth } = useMemo(
    () => computeLayout(displayNodes, displayEdges, containerWidth),
    [displayNodes, displayEdges, containerWidth]
  );

  // Apply a zoom level imperatively to the DOM. Zoom only spreads the tree
  // HORIZONTALLY (row heights stay fixed), so the focal point is pinned along x
  // only. No React render — buttery smooth.
  const applyZoom = useCallback((nextZoom, focalClientX) => {
    const scroller = scrollRef.current;
    const sizer = sizerRef.current;
    if (!scroller || !sizer) return;

    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const prevZoom = zoomRef.current;
    const rect = scroller.getBoundingClientRect();

    // Default focal point = center of the visible viewport
    const fx = focalClientX != null ? focalClientX - rect.left : scroller.clientWidth / 2;

    // Content-space x under the focal point before scaling
    const contentX = (scroller.scrollLeft + fx) / prevZoom;

    // Grow the scrollable area and the spread factor; nodes/edges read --zx
    sizer.style.width = `${totalWidth * z}px`;
    sizer.style.setProperty('--zx', z);

    // Re-pin the focal point horizontally
    scroller.scrollLeft = contentX * z - fx;

    zoomRef.current = z;
    return z;
  }, [totalWidth]);

  // Ctrl+wheel to zoom on desktop, and pinch-to-zoom on mobile.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const setInstant = (on) => {
      const sizer = sizerRef.current;
      if (sizer) sizer.style.setProperty('--tdur', on ? '0s' : '0.18s');
    };

    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setInstant(true);
      applyZoom(zoomRef.current * (1 - e.deltaY * 0.002), e.clientX);
      setZoom(zoomRef.current);
    };

    const midpoint = (t) => (t[0].clientX + t[1].clientX) / 2;
    const distance = (t) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        gestureRef.current = {
          startDist: distance(e.touches),
          startZoom: zoomRef.current,
        };
        // Disable transitions so the pinch tracks the fingers exactly
        setInstant(true);
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !gestureRef.current) return;
      e.preventDefault();
      const { startDist, startZoom } = gestureRef.current;
      applyZoom(startZoom * (distance(e.touches) / startDist), midpoint(e.touches));
    };

    const onTouchEnd = (e) => {
      if (e.touches.length < 2 && gestureRef.current) {
        gestureRef.current = null;
        setInstant(false);
        setZoom(zoomRef.current); // commit once
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [applyZoom]);

  // Buttons zoom toward the viewport center, animated via the CSS transition.
  const zoomByButton = (delta) => {
    applyZoom(zoomRef.current + delta);
    setZoom(zoomRef.current);
  };

  // When the layout grows wider than the viewport, center the scroll on the
  // tree's spine (root, hints and mystery all sit at the horizontal center).
  // Keyed on base totalWidth only, so committing a zoom never recenters.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scaledWidth = totalWidth * zoomRef.current;
    if (scaledWidth > el.clientWidth) {
      el.scrollLeft = (scaledWidth - el.clientWidth) / 2;
    }
  }, [totalWidth]);

  const noGuesses = guesses.length === 0;

  return (
    <>
      {!noGuesses && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={declutter}
                onChange={(e) => setDeclutter(e.target.checked)}
                color="primary"
              />
            }
            label={<Typography variant="caption" color="text.secondary">Simplified</Typography>}
            labelPlacement="start"
            sx={{ m: 0, gap: 0.5 }}
          />
        </Box>
      )}
      <Box sx={{ position: 'relative' }}>
        <Box
          ref={scrollRef}
          sx={{
            position: 'relative',
            width: '100%',
            overflowY: 'auto',
            overflowX: 'auto',
            minHeight: 160,
            bgcolor: 'background.default',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            touchAction: 'pan-x pan-y',
            WebkitOverflowScrolling: 'touch',
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
            // Sizer is the scrollable area. --zx is the horizontal spread factor
            // (zoom); nodes read it to push apart, the SVG scales along x to match.
            <Box
              ref={sizerRef}
              style={{
                position: 'relative',
                width: totalWidth * zoom,
                height: totalHeight,
                transition: 'width var(--tdur, 0.18s) ease-out',
                '--zx': zoom,
                '--tdur': '0.18s',
              }}
            >
              <Box
                component="svg"
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: totalWidth,
                  height: totalHeight,
                  transformOrigin: '0 0',
                  transform: 'scaleX(var(--zx, 1))',
                  transition: 'transform var(--tdur, 0.18s) ease-out',
                  pointerEvents: 'none',
                }}
                aria-hidden="true"
              >
                <TreeEdges treeEdges={displayEdges} positions={positions} />
              </Box>

              {Array.from(displayNodes.entries()).map(([taxId, node]) => (
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

        {/* Zoom controls */}
        {!noGuesses && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              zIndex: 2,
            }}
          >
            <IconButton
              size="small"
              onClick={() => zoomByButton(0.3)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              sx={{
                width: 28, height: 28,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => zoomByButton(-0.3)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              sx={{
                width: 28, height: 28,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <RemoveIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        )}
      </Box>

      <WikiDialog node={wikiNode} onClose={() => setWikiNode(null)} />
    </>
  );
}
