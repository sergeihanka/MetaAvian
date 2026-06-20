import React, { useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Slide from '@mui/material/Slide';
import CloseIcon from '@mui/icons-material/Close';
import { useGame } from '../context/GameContext.jsx';
import { getAviaryMe } from '../services/api.js';
import BirdIcon from './BirdIcon.jsx';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function AviaryScreen() {
  const { state, dispatch } = useGame();
  const {
    showAviary,
    aviaryBirds,
    aviaryLoaded,
    berryBalance,
    birdEquipment,
    ownedAccessories,
    user,
  } = state;

  const handleClose = () => dispatch({ type: 'TOGGLE_AVIARY' });

  useEffect(() => {
    if (!showAviary || !user || aviaryLoaded) return;

    getAviaryMe()
      .then((data) => {
        dispatch({ type: 'LOAD_AVIARY', payload: data });
        if (!data.aviaryStarterPicked) {
          dispatch({ type: 'SHOW_STARTER_PICKER' });
        }
      })
      .catch(() => {
        // non-fatal — show empty state
      });
  }, [showAviary, user, aviaryLoaded, dispatch]);

  return (
    <Dialog
      open={showAviary}
      onClose={handleClose}
      TransitionComponent={Transition}
      aria-labelledby="aviary-title"
      sx={{
        '& .MuiDialog-paper': {
          position: 'fixed',
          bottom: 0,
          m: 0,
          borderRadius: '16px 16px 0 0',
          width: '100%',
          maxWidth: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
        },
        '& .MuiDialog-container': { alignItems: 'flex-end' },
      }}
    >
      <DialogTitle
        id="aviary-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0.5 }}
      >
        <Box>
          <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
            Your Aviary
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {aviaryBirds.length} bird{aviaryBirds.length !== 1 ? 's' : ''} collected
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={`🫐 ${berryBalance}`}
            size="small"
            sx={{
              backgroundColor: '#FFF8E1',
              color: '#B8860B',
              fontWeight: 700,
              fontSize: '13px',
              border: '1px solid #B8860B',
            }}
            aria-label={`${berryBalance} berries`}
          />
          <IconButton
            aria-label="Close aviary"
            onClick={handleClose}
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 1, pb: 4 }}>
        {!aviaryLoaded && user && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress color="primary" />
          </Box>
        )}

        {aviaryLoaded && aviaryBirds.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h4" aria-hidden="true" sx={{ mb: 1 }}>🐦</Typography>
            <Typography variant="body1" color="text.secondary">
              Your Aviary is empty. Win a daily puzzle to add a bird!
            </Typography>
          </Box>
        )}

        {aviaryBirds.length > 0 && (
          <Box
            role="list"
            aria-label="Your bird collection"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1.5,
              mt: 1,
            }}
          >
            {aviaryBirds.map((bird) => {
              const equippedId = birdEquipment[bird._id] || null;
              const equippedAccessory = ownedAccessories.find((a) => a._id === equippedId) || null;
              return (
                <Box key={bird._id} role="listitem">
                  <Card
                    sx={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  >
                    <CardActionArea
                      onClick={() => dispatch({ type: 'OPEN_BIRD_VIEWER', payload: { birdId: bird._id } })}
                      aria-label={`View ${bird.commonName}`}
                      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, p: 1.5 }}
                    >
                      <BirdIcon bird={bird} accessory={equippedAccessory} size={56} />
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, textAlign: 'center', lineHeight: 1.2, fontSize: '11px' }}
                      >
                        {bird.commonName}
                      </Typography>
                    </CardActionArea>
                  </Card>
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
