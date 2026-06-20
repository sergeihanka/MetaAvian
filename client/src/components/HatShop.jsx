import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import { getShop } from '../services/api.js';

export default function HatShop({
  birdId,
  equippedAccessoryId,
  ownedAccessories,
  featherBalance,
  onPurchase,
  onEquip,
  onUnequip,
}) {
  const [shop, setShop] = useState([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [confirmItem, setConfirmItem] = useState(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    setShopLoading(true);
    getShop()
      .then((data) => setShop(data.accessories || []))
      .catch(() => {})
      .finally(() => setShopLoading(false));
  }, []);

  const equippedAccessory = ownedAccessories.find((a) => a._id === equippedAccessoryId) || null;
  const ownedIds = new Set(ownedAccessories.map((a) => a._id));

  const handleBuyConfirm = async () => {
    if (!confirmItem) return;
    setPurchasing(true);
    try {
      await onPurchase(confirmItem.slug);
      setConfirmItem(null);
    } catch {
      // parent handles errors
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 2 }}>
      {/* Equipped Hat */}
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '11px', letterSpacing: 1 }}>
          Equipped Hat
        </Typography>
        {equippedAccessory ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Box
              component="img"
              src={equippedAccessory.iconPath}
              alt={equippedAccessory.name}
              sx={{ width: 40, height: 40, objectFit: 'contain' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{equippedAccessory.name}</Typography>
              <Typography variant="caption" color="text.secondary">{equippedAccessory.description}</Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => onUnequip(birdId)}
              sx={{ minHeight: 36, fontSize: '12px' }}
            >
              Remove
            </Button>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            No hat equipped
          </Typography>
        )}
      </Box>

      <Divider />

      {/* My Hats */}
      {ownedAccessories.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '11px', letterSpacing: 1 }}>
            My Hats
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 0.5 }}>
            {ownedAccessories.map((acc) => {
              const isEquipped = acc._id === equippedAccessoryId;
              return (
                <Box
                  key={acc._id}
                  onClick={() => isEquipped ? onUnequip(birdId) : onEquip(birdId, acc._id)}
                  role="button"
                  aria-label={isEquipped ? `Remove ${acc.name}` : `Equip ${acc.name}`}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && (isEquipped ? onUnequip(birdId) : onEquip(birdId, acc._id))}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 0.5,
                    p: 1,
                    borderRadius: 2,
                    border: '2px solid',
                    borderColor: isEquipped ? 'primary.main' : 'divider',
                    bgcolor: isEquipped ? 'action.selected' : 'background.paper',
                    cursor: 'pointer',
                    minWidth: 64,
                    flexShrink: 0,
                    '&:hover': { borderColor: 'primary.light' },
                  }}
                >
                  <Box
                    component="img"
                    src={acc.iconPath}
                    alt={acc.name}
                    sx={{ width: 36, height: 36, objectFit: 'contain' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '10px', textAlign: 'center', lineHeight: 1.2 }}>
                    {acc.name}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      <Divider />

      {/* Hat Shop */}
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '11px', letterSpacing: 1 }}>
          Hat Shop
        </Typography>

        {shopLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} color="primary" />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {shop.map((item) => {
              const owned = ownedIds.has(item._id);
              const canAfford = featherBalance >= item.cost;
              return (
                <Box
                  key={item._id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                  }}
                >
                  <Box
                    component="img"
                    src={item.iconPath}
                    alt={item.name}
                    sx={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {item.description}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#B8860B' }}>
                      {item.cost} 🪶
                    </Typography>
                  </Box>
                  {owned ? (
                    <Chip
                      label="Owned"
                      size="small"
                      sx={{ bgcolor: '#169A43', color: '#fff', fontWeight: 700, fontSize: '11px' }}
                    />
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!canAfford}
                      onClick={() => setConfirmItem(item)}
                      sx={{ minHeight: 36, fontSize: '12px', flexShrink: 0 }}
                      aria-label={canAfford ? `Buy ${item.name} for ${item.cost} feathers` : `Need ${item.cost - featherBalance} more feathers for ${item.name}`}
                    >
                      Buy
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Purchase confirmation dialog */}
      <Dialog
        open={!!confirmItem}
        onClose={() => !purchasing && setConfirmItem(null)}
        aria-labelledby="purchase-confirm-title"
        PaperProps={{ sx: { borderRadius: 3, mx: 2 } }}
      >
        <DialogTitle id="purchase-confirm-title" sx={{ pb: 0.5 }}>Confirm Purchase</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Spend <strong>{confirmItem?.cost} 🪶</strong> on <strong>{confirmItem?.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            You have {featherBalance} feathers. You&apos;ll have {featherBalance - (confirmItem?.cost || 0)} after.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setConfirmItem(null)} disabled={purchasing} fullWidth>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleBuyConfirm} disabled={purchasing} fullWidth>
            {purchasing ? <CircularProgress size={18} color="inherit" /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
