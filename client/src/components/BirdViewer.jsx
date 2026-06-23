import React, { useState, useRef, useEffect, useCallback } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';
import Slide from '@mui/material/Slide';
import Alert from '@mui/material/Alert';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useGame } from '../context/GameContext.jsx';
import { getWikiInfo, purchaseAccessory as purchaseAccessoryApi, equipAccessory, getBirdPortrait, retryBirdPortrait } from '../services/api.js';
import BirdIcon from './BirdIcon.jsx';
import HatShop from './HatShop.jsx';
import BerryIcon from './BerryIcon.jsx';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

function InfoTab({ bird }) {
  const [wiki, setWiki] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!bird) return;
    setLoading(true);
    setError(false);
    getWikiInfo(bird.wikiTitle || bird.commonName)
      .then((data) => setWiki(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [bird]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2 }} />
        <Skeleton variant="text" height={20} />
        <Skeleton variant="text" height={20} width="80%" />
        <Skeleton variant="text" height={20} width="60%" />
      </Box>
    );
  }

  if (error || !wiki) {
    return (
      <Box sx={{ pt: 2 }}>
        <Alert severity="info">Bird info not available right now.</Alert>
      </Box>
    );
  }

  const thumbnail = wiki.thumbnail?.source;
  const extract = wiki.extract
    ? wiki.extract.split('. ').slice(0, 3).join('. ') + '.'
    : null;
  const wikiUrl = wiki.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(bird.commonName)}`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
      {thumbnail && (
        <Box
          component="img"
          src={thumbnail}
          alt={bird.commonName}
          sx={{ width: '100%', borderRadius: 2, objectFit: 'cover', maxHeight: 200 }}
        />
      )}
      {extract && (
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          {extract}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {bird.order && (
          <Chip label={`Order: ${bird.order}`} size="small" variant="outlined" />
        )}
        {bird.family && (
          <Chip label={`Family: ${bird.family}`} size="small" variant="outlined" />
        )}
      </Box>
      <Box
        component="a"
        href={wikiUrl}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'primary.main', fontSize: '13px', fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
        aria-label={`Read more about ${bird.commonName} on Wikipedia (opens in new tab)`}
      >
        Read more on Wikipedia <OpenInNewIcon sx={{ fontSize: 14 }} />
      </Box>
    </Box>
  );
}

export default function BirdViewer() {
  const { state, dispatch } = useGame();
  const { showBirdViewer, viewingBirdId, aviaryBirds, birdEquipment, ownedAccessories, berryBalance, birdPortraits } = state;

  const [tab, setTab] = useState(0);
  const [birdRotation, setBirdRotation] = useState(0);
  const [shopError, setShopError] = useState(null);
  const [pollCount, setPollCount] = useState(0);
  const [pollError, setPollError] = useState(false);
  const stageRef = useRef(null);

  const bird = aviaryBirds.find((b) => b._id === viewingBirdId) || null;
  const equippedAccessoryId = viewingBirdId ? (birdEquipment[viewingBirdId] || null) : null;
  const equippedAccessory = ownedAccessories.find((a) => a._id === equippedAccessoryId) || null;

  const handleClose = () => dispatch({ type: 'CLOSE_BIRD_VIEWER' });

  const handleMouseMove = useCallback((e) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    setBirdRotation((x - 0.5) * 16);
  }, []);

  const handleMouseLeave = useCallback(() => setBirdRotation(0), []);

  // Reset poll state when viewed bird changes
  useEffect(() => {
    setPollCount(0);
    setPollError(false);
  }, [viewingBirdId]);

  // Poll for portrait updates when dirty
  const portrait = (birdPortraits && birdPortraits[viewingBirdId]) || {};
  const isDirty = !!portrait.dirty;

  useEffect(() => {
    if (!isDirty || !viewingBirdId) return;
    if (pollCount >= 10) { setPollError(true); return; }

    const timer = setTimeout(async () => {
      try {
        const result = await getBirdPortrait(viewingBirdId);
        if (!result.portraitDirty && result.portraitUrl) {
          dispatch({ type: 'SET_BIRD_PORTRAIT', payload: { birdId: viewingBirdId, url: result.portraitUrl, dirty: false, jobId: null } });
          setPollCount(0);
          setPollError(false);
        } else if (result.jobStatus === 'failed') {
          setPollError(true);
        } else {
          setPollCount((c) => c + 1);
        }
      } catch {
        setPollCount((c) => c + 1);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isDirty, pollCount, viewingBirdId, dispatch]);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const handleOrientation = (e) => {
      const gamma = Math.max(-45, Math.min(45, e.gamma || 0));
      setBirdRotation(gamma * 0.18);
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  const handlePurchase = async (slug) => {
    setShopError(null);
    try {
      const result = await purchaseAccessoryApi(slug);
      const newAccessory = result.ownedAccessories[result.ownedAccessories.length - 1];
      dispatch({
        type: 'PURCHASE_ACCESSORY',
        payload: {
          accessory: newAccessory,
          newBalance: result.berryBalance,
        },
      });
    } catch (err) {
      setShopError(err.message || 'Purchase failed.');
    }
  };

  const handleEquip = async (birdId, accessoryId) => {
    dispatch({ type: 'EQUIP_ACCESSORY', payload: { birdId, accessoryId } });
    try {
      await equipAccessory(birdId, accessoryId);
      dispatch({ type: 'SET_BIRD_PORTRAIT', payload: { birdId, url: (birdPortraits[birdId] || {}).url ?? null, dirty: true, jobId: null } });
      setPollCount(0);
      setPollError(false);
    } catch {
      dispatch({ type: 'UNEQUIP_ACCESSORY', payload: { birdId } });
    }
  };

  const handleUnequip = async (birdId) => {
    dispatch({ type: 'UNEQUIP_ACCESSORY', payload: { birdId } });
    try {
      await equipAccessory(birdId, null);
      dispatch({ type: 'SET_BIRD_PORTRAIT', payload: { birdId, url: (birdPortraits[birdId] || {}).url ?? null, dirty: true, jobId: null } });
      setPollCount(0);
      setPollError(false);
    } catch {
      // best-effort
    }
  };

  if (!bird) return null;

  const accentColor = bird.accentColor || '#169A43';
  const bgGradient = `radial-gradient(ellipse at center, ${accentColor}22 0%, #F8FAFB 70%)`;

  return (
    <Dialog
      open={showBirdViewer}
      onClose={handleClose}
      TransitionComponent={Transition}
      fullScreen
      aria-labelledby="bird-viewer-title"
    >
      <DialogTitle
        id="bird-viewer-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}
      >
        <IconButton
          aria-label="Close bird viewer"
          onClick={handleClose}
          sx={{ minHeight: 44, minWidth: 44 }}
        >
          <CloseIcon />
        </IconButton>
        <Chip
          label={<Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><BerryIcon size={16} /> {berryBalance}</Box>}
          size="small"
          sx={{ backgroundColor: '#FFF8E1', color: '#B8860B', fontWeight: 700, border: '1px solid #B8860B' }}
          aria-label={`${berryBalance} berries`}
        />
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Stage */}
        <Box
          ref={stageRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          sx={{
            background: bgGradient,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 4,
            gap: 1.5,
            flexShrink: 0,
            minHeight: '40vh',
          }}
        >
          <Box
            sx={{
              transform: `perspective(600px) rotateY(${birdRotation}deg)`,
              transition: 'transform 0.05s ease-out',
            }}
          >
            {portrait.url ? (
              <Box sx={{ position: 'relative' }}>
                <Box
                  component="img"
                  src={portrait.url}
                  alt={bird.commonName}
                  sx={{ width: 180, height: 180, objectFit: 'contain', borderRadius: 3, display: 'block' }}
                />
                {isDirty && !pollError && (
                  <Chip
                    label="Updating portrait…"
                    size="small"
                    sx={{ position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)', fontSize: '10px', bgcolor: 'rgba(0,0,0,0.6)', color: '#fff' }}
                  />
                )}
                {pollError && (
                  <Button
                    size="small"
                    variant="outlined"
                    sx={{ position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)', fontSize: '10px', whiteSpace: 'nowrap' }}
                    onClick={async () => {
                      try {
                        await retryBirdPortrait(viewingBirdId);
                        dispatch({ type: 'SET_BIRD_PORTRAIT', payload: { birdId: viewingBirdId, url: portrait.url, dirty: true, jobId: null } });
                        setPollCount(0);
                        setPollError(false);
                      } catch {}
                    }}
                  >
                    Retry portrait
                  </Button>
                )}
              </Box>
            ) : (
              <BirdIcon bird={bird} accessory={equippedAccessory} size={180} />
            )}
          </Box>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mt: 1 }}>
            {bird.commonName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {bird.scientificName}
          </Typography>
        </Box>

        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          aria-label="Bird viewer tabs"
          sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Tab label="Outfit" id="tab-outfit" aria-controls="tabpanel-outfit" />
          <Tab label="Info" id="tab-info" aria-controls="tabpanel-info" />
        </Tabs>

        <Box
          role="tabpanel"
          id={tab === 0 ? 'tabpanel-outfit' : 'tabpanel-info'}
          aria-labelledby={tab === 0 ? 'tab-outfit' : 'tab-info'}
          sx={{ flex: 1, overflowY: 'auto', px: 2, pt: 1 }}
        >
          {shopError && (
            <Alert severity="error" onClose={() => setShopError(null)} sx={{ mb: 1 }}>
              {shopError}
            </Alert>
          )}
          {tab === 0 && (
            <HatShop
              birdId={viewingBirdId}
              equippedAccessoryId={equippedAccessoryId}
              ownedAccessories={ownedAccessories}
              berryBalance={berryBalance}
              onPurchase={handlePurchase}
              onEquip={handleEquip}
              onUnequip={handleUnequip}
            />
          )}
          {tab === 1 && <InfoTab bird={bird} />}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
