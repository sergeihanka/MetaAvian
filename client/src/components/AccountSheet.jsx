import React, { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Avatar from "@mui/material/Avatar";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import InputAdornment from "@mui/material/InputAdornment";
import Slide from "@mui/material/Slide";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { useGame } from "../context/GameContext.jsx";
import { login, register, forgotPassword } from "../services/api.js";

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// ─── Password strength ───────────────────────────────────────────────────────

const RULES = [
  { id: "len",     label: "At least 8 characters",     test: (p) => p.length >= 8 },
  { id: "upper",   label: "One uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "number",  label: "One number (0–9)",           test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "One special character",      test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function getStrength(password) {
  if (!password) return { score: 0, label: "", color: "transparent" };
  const passed = RULES.filter((r) => r.test(password)).length;
  if (passed <= 1) return { score: 25,  label: "Weak",   color: "#EF2A2A" };
  if (passed === 2) return { score: 50,  label: "Fair",   color: "#E65100" };
  if (passed === 3) return { score: 75,  label: "Good",   color: "#1495D7" };
  return              { score: 100, label: "Strong", color: "#169A43" };
}

function PasswordStrength({ password }) {
  const { score, label, color } = getStrength(password);
  if (!password) return null;

  return (
    <Box sx={{ mt: 0.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">Password strength</Typography>
        <Typography variant="caption" sx={{ fontWeight: 700, color }}>{label}</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={score}
        sx={{
          height: 4,
          borderRadius: 2,
          bgcolor: "grey.200",
          "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 2 },
        }}
      />
      <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, mt: 1, display: "flex", flexDirection: "column", gap: 0.25 }}>
        {RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <Box component="li" key={rule.id} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              {ok
                ? <CheckCircleIcon sx={{ fontSize: 14, color: "#169A43" }} />
                : <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: "text.disabled" }} />}
              <Typography variant="caption" sx={{ color: ok ? "#169A43" : "text.secondary" }}>
                {rule.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Signed-in view ──────────────────────────────────────────────────────────

function SignedInView({ user, dispatch }) {
  const initial = user.displayName
    ? user.displayName[0].toUpperCase()
    : user.email
      ? user.email[0].toUpperCase()
      : "?";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", py: 2 }}>
      <Avatar
        sx={{ width: 64, height: 64, bgcolor: "primary.main", fontSize: 28, fontWeight: 700 }}
        aria-label={`Avatar for ${user.displayName || user.email}`}
      >
        {initial}
      </Avatar>
      <Box sx={{ textAlign: "center" }}>
        {user.displayName && (
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{user.displayName}</Typography>
        )}
        <Typography variant="body2" color="text.secondary">{user.email}</Typography>
      </Box>
      <Button
        variant="outlined"
        color="error"
        fullWidth
        onClick={() => dispatch({ type: "SIGN_OUT" })}
        sx={{ mt: 1 }}
        aria-label="Sign out of your account"
      >
        Sign Out
      </Button>
    </Box>
  );
}

// ─── Auth form ───────────────────────────────────────────────────────────────

function EmailAuthForm({ dispatch, onClose }) {
  const [tab, setTab] = useState(0); // 0 = Sign In, 1 = Create Account
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const isRegister = tab === 1;

  const clearState = () => { setError(null); setSuccess(null); };

  const handleTabChange = (_, newVal) => {
    setTab(newVal);
    clearState();
    setFirstName("");
    setLastName("");
    setPassword("");
    setShowPassword(false);
  };

  const allRulesPassed = RULES.every((r) => r.test(password));

  const handleSubmit = async () => {
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    if (isRegister) {
      if (!firstName.trim() || !lastName.trim()) {
        setError("Please enter your first and last name.");
        return;
      }
      if (!allRulesPassed) {
        setError("Please meet all password requirements before continuing.");
        return;
      }
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!isRegister) {
        const data = await login(email, password);
        dispatch({ type: "SET_AUTH", payload: { token: data.token, user: data.user } });
        onClose();
      } else {
        await register(email, password, firstName.trim(), lastName.trim());
        setSuccess("Account created! Check your email to verify your address before signing in.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) { setError("Enter your email address above first."); return; }
    setLoading(true);
    clearState();
    try {
      await forgotPassword(email);
      setSuccess("Check your email for a password reset link.");
    } catch (err) {
      setError(err.message || "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Tabs value={tab} onChange={handleTabChange} variant="fullWidth" aria-label="Authentication tab">
        <Tab label="Sign In" aria-label="Switch to sign in tab" />
        <Tab label="Create Account" aria-label="Switch to create account tab" />
      </Tabs>

      {/* Name fields — registration only */}
      {isRegister && (
        <Box sx={{ display: "flex", gap: 1.5 }}>
          <TextField
            label="First name"
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); clearState(); }}
            fullWidth
            autoComplete="given-name"
            inputProps={{ "aria-label": "First name" }}
          />
          <TextField
            label="Last name"
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); clearState(); }}
            fullWidth
            autoComplete="family-name"
            inputProps={{ "aria-label": "Last name" }}
          />
        </Box>
      )}

      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); clearState(); }}
        fullWidth
        autoComplete="email"
        inputProps={{ "aria-label": "Email address" }}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />

      <Box>
        <TextField
          label="Password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => { setPassword(e.target.value); clearState(); }}
          fullWidth
          autoComplete={isRegister ? "new-password" : "current-password"}
          inputProps={{ "aria-label": "Password" }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  edge="end"
                  size="small"
                >
                  {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        {/* Strength meter — registration only */}
        {isRegister && <PasswordStrength password={password} />}
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      <Button
        variant="contained"
        fullWidth
        onClick={handleSubmit}
        disabled={loading || (isRegister && password.length > 0 && !allRulesPassed)}
        aria-label={isRegister ? "Create your account" : "Sign in with email"}
      >
        {loading
          ? <CircularProgress size={20} color="inherit" />
          : isRegister ? "Create Account" : "Sign In"}
      </Button>

      {!isRegister && (
        <Button
          variant="text"
          size="small"
          sx={{ color: "text.secondary", alignSelf: "center" }}
          onClick={handleForgotPassword}
          disabled={loading}
          aria-label="Forgot your password"
        >
          Forgot password?
        </Button>
      )}
    </Box>
  );
}

// ─── AccountSheet ─────────────────────────────────────────────────────────────

export default function AccountSheet() {
  const { state, dispatch } = useGame();
  const { showAccount, user } = state;

  const handleClose = () => dispatch({ type: "TOGGLE_ACCOUNT" });

  return (
    <Dialog
      open={showAccount}
      onClose={handleClose}
      TransitionComponent={Transition}
      aria-labelledby="account-title"
      sx={{
        "& .MuiDialog-paper": {
          position: "fixed",
          bottom: 0,
          m: 0,
          borderRadius: "16px 16px 0 0",
          width: "100%",
          maxWidth: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        },
        "& .MuiDialog-container": { alignItems: "flex-end" },
      }}
    >
      <DialogTitle
        id="account-title"
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}
      >
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          {user ? "Your Account" : "Sign In / Register"}
        </Typography>
        <IconButton
          aria-label="Close account sheet"
          onClick={handleClose}
          sx={{ minHeight: 44, minWidth: 44 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 4 }}>
        {user
          ? <SignedInView user={user} dispatch={dispatch} />
          : <EmailAuthForm dispatch={dispatch} onClose={handleClose} />}
      </DialogContent>
    </Dialog>
  );
}
