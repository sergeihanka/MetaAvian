import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#169A43', dark: '#0F6D3D', contrastText: '#fff' },
    secondary: { main: '#1495D7', light: '#9FD3F2', contrastText: '#fff' },
    error: { main: '#EF2A2A' },
    background: { default: '#F8FAFB', paper: '#FFFFFF' },
    success: { main: '#169A43', dark: '#0F6D3D' },
  },
  typography: {
    fontFamily:
      "-apple-system, 'SF Pro Text', BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 24,
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 44,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': { borderRadius: 14 },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 10, fontSize: '13px' },
      },
      variants: [
        {
          props: { variant: 'berry' },
          style: {
            backgroundColor: '#FFF8E1',
            color: '#B8860B',
            fontWeight: 700,
            fontSize: '13px',
            border: '1px solid #B8860B',
          },
        },
      ],
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: '16px 16px 0 0',
          margin: 0,
          width: '100%',
          maxWidth: '100%',
        },
      },
    },
  },
});
