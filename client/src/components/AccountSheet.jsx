import React, { useState, useEffect, useRef } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Avatar from "@mui/material/Avatar";
import Alert from "@mui/material/Alert";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Divider from "@mui/material/Divider";
import InputAdornment from "@mui/material/InputAdornment";
import Slide from "@mui/material/Slide";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import BarChartIcon from "@mui/icons-material/BarChart";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import { useGame } from "../context/GameContext.jsx";
import { login, register, forgotPassword, resendVerification, getUserStats, cancelRegistration } from "../services/api.js";
import { GAME_STATE_KEY_PREFIX } from "../config.js";
import AviaryTeaser from "./AviaryTeaser.jsx";

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const RESEND_COOLDOWN_SECS = 120;

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

// ─── Resend button ───────────────────────────────────────────────────────────

function ResendButton({ email }) {
  const [cooldown, setCooldown] = useState(0); // seconds remaining
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const timerRef = useRef(null);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECS);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const handleResend = async () => {
    if (cooldown > 0 || sending) return;
    setSending(true);
    try {
      await resendVerification(email);
      setSent(true);
      startCooldown();
    } catch {
      // resend always returns 200, so errors are network-only
    } finally {
      setSending(false);
    }
  };

  const mins = String(Math.floor(cooldown / 60)).padStart(1, "0");
  const secs = String(cooldown % 60).padStart(2, "0");

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <Typography variant="body2" color="text.secondary">
        {sent ? "Verification email sent." : "Didn't receive the email?"}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        disabled={cooldown > 0 || sending}
        onClick={handleResend}
        sx={{ minHeight: 36, fontSize: "12px", borderRadius: 2 }}
      >
        {sending
          ? <CircularProgress size={14} color="inherit" />
          : cooldown > 0
            ? `Resend in ${mins}:${secs}`
            : "Resend email"}
      </Button>
    </Box>
  );
}

// ─── Pending verification view ───────────────────────────────────────────────

function PendingVerificationView({ email, onCancelled }) {
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelRegistration(email);
    } catch { /* always succeed locally */ }
    setCancelling(false);
    onCancelled();
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2.5, py: 2, textAlign: "center" }}>
      <Typography variant="h2" component="div" aria-hidden="true">✉️</Typography>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Check your email</Typography>
        <Typography variant="body2" color="text.secondary">
          We sent a verification link to
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: "break-all" }}>{email}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Click the link to activate your account.
        </Typography>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
        <ResendButton email={email} />
        <Typography variant="caption" color="text.secondary">
          Can't find it? Check your spam or junk folder.
        </Typography>
      </Box>

      <Button
        variant="text"
        size="small"
        color="error"
        onClick={handleCancel}
        disabled={cancelling}
        sx={{ mt: 1 }}
        aria-label="Cancel registration and delete this account"
      >
        {cancelling ? <CircularProgress size={14} color="inherit" /> : "Cancel registration"}
      </Button>
    </Box>
  );
}

// ─── Local stats helper (mirrors StatsScreen logic) ──────────────────────────

function computeLocalStats() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(GAME_STATE_KEY_PREFIX));
  let played = 0, won = 0, streakCount = 0, maxStreak = 0;
  let lastDate = null;
  const sorted = keys
    .map((k) => ({ date: k.replace(GAME_STATE_KEY_PREFIX, ""), key: k }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  for (const { date, key } of sorted) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      if (!data.phase || data.phase === "loading" || data.phase === "idle") continue;
      played++;
      if (data.phase === "won") {
        won++;
        if (lastDate) {
          const diff = (new Date(date) - new Date(lastDate)) / 86400000;
          streakCount = diff === 1 ? streakCount + 1 : 1;
        } else { streakCount = 1; }
        lastDate = date;
      } else { streakCount = 0; lastDate = null; }
      maxStreak = Math.max(maxStreak, streakCount);
    } catch { /* skip */ }
  }
  return {
    played,
    won,
    winRate: played > 0 ? Math.round((won / played) * 100) : 0,
    currentStreak: streakCount,
    maxStreak,
  };
}

// ─── Signed-in view ──────────────────────────────────────────────────────────

function SignedInView({ user, state, dispatch }) {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const initial = user.displayName
    ? user.displayName[0].toUpperCase()
    : user.email?.[0]?.toUpperCase() ?? "?";

  const gameOver = state.phase === "won" || state.phase === "lost";

  useEffect(() => {
    setStatsLoading(true);
    getUserStats()
      .then((data) => setStats(data))
      .catch(() => setStats(computeLocalStats()))
      .finally(() => setStatsLoading(false));
  }, [state.phase]); // re-fetch when a game completes

  const handleViewResults = () => {
    dispatch({ type: "TOGGLE_ACCOUNT" });
    dispatch({ type: "TOGGLE_RESULTS" });
  };

  const handleViewStats = () => {
    dispatch({ type: "TOGGLE_ACCOUNT" });
    dispatch({ type: "TOGGLE_STATS" });
  };

  const statItems = stats
    ? [
        { label: "Played",  value: stats.played ?? 0 },
        { label: "Win %",   value: `${stats.winRate ?? 0}%` },
        { label: "Streak",  value: stats.currentStreak ?? 0 },
        { label: "Best",    value: stats.maxStreak ?? 0 },
      ]
    : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, py: 1 }}>
      {/* Avatar + identity */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Avatar
          sx={{ width: 52, height: 52, bgcolor: "primary.main", fontSize: 22, fontWeight: 700, flexShrink: 0 }}
          aria-label={`Avatar for ${user.displayName || user.email}`}
        >
          {initial}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          {user.displayName && (
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{user.displayName}</Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-all" }}>{user.email}</Typography>
        </Box>
      </Box>

      <Divider />

      {/* Stats row */}
      {statsLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
          <CircularProgress size={20} color="inherit" />
        </Box>
      ) : statItems ? (
        <Box sx={{ display: "flex", textAlign: "center" }}>
          {statItems.map(({ label, value }) => (
            <Box key={label} sx={{ flex: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{value}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {label}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : null}

      {/* Feather balance */}
      {stats && (
        <Box sx={{ textAlign: "center", mt: -0.5 }}>
          <Typography variant="body2" color="text.secondary">
            🪶 <strong>{state.featherBalance}</strong> Feathers
          </Typography>
        </Box>
      )}

      {/* Action buttons */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Button
          variant="contained"
          fullWidth
          onClick={() => { dispatch({ type: "TOGGLE_ACCOUNT" }); dispatch({ type: "TOGGLE_AVIARY" }); }}
          aria-label="Open your aviary"
        >
          Open Your Aviary 🪽
        </Button>
        {gameOver && (
          <Button
            variant="contained"
            fullWidth
            startIcon={<EmojiEventsOutlinedIcon />}
            onClick={handleViewResults}
            aria-label="View today's results"
          >
            View Today's Results
          </Button>
        )}
        <Button
          variant="outlined"
          fullWidth
          startIcon={<BarChartIcon />}
          onClick={handleViewStats}
          aria-label="View full stats"
        >
          Full Stats
        </Button>
        <Button
          variant="outlined"
          color="error"
          fullWidth
          onClick={() => dispatch({ type: "SIGN_OUT" })}
          aria-label="Sign out of your account"
        >
          Sign Out
        </Button>
      </Box>
    </Box>
  );
}

// ─── Auth form ───────────────────────────────────────────────────────────────

function EmailAuthForm({ dispatch, onClose }) {
  const [tab, setTab] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showResend, setShowResend] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [registrationPending, setRegistrationPending] = useState(false);

  const isRegister = tab === 1;

  const clearState = () => { setError(null); setSuccess(null); };

  const handleTabChange = (_, newVal) => {
    setTab(newVal);
    clearState();
    setFirstName(""); setLastName("");
    setPassword(""); setConfirmPassword("");
    setShowPassword(false); setShowConfirm(false);
    setShowResend(false); setRegisteredEmail("");
    setRegistrationPending(false);
  };

  const handleCancelled = () => {
    setRegistrationPending(false);
    setRegisteredEmail("");
    setTab(0); // back to Sign In tab
    clearState();
  };

  const allRulesPassed = RULES.every((r) => r.test(password));
  const passwordsMatch = confirmPassword === "" || password === confirmPassword;
  const confirmDirty = confirmPassword.length > 0;
  const confirmMatch = confirmDirty && password === confirmPassword;
  const confirmMismatch = confirmDirty && password !== confirmPassword;

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
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    clearState();
    setShowResend(false);

    try {
      if (!isRegister) {
        const data = await login(email, password);
        dispatch({ type: "SET_AUTH", payload: { token: data.token, user: data.user } });
        onClose();
      } else {
        await register(email, password, firstName.trim(), lastName.trim());
        setRegisteredEmail(email);
        setRegistrationPending(true);
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      // Show resend if login blocked because email isn't verified
      if (err.data?.resendAvailable) {
        setRegisteredEmail(email);
        setShowResend(true);
      }
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

  const submitDisabled = loading
    || (isRegister && password.length > 0 && !allRulesPassed)
    || (isRegister && confirmMismatch);

  if (registrationPending) {
    return <PendingVerificationView email={registeredEmail} onCancelled={handleCancelled} />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Tabs value={tab} onChange={handleTabChange} variant="fullWidth" aria-label="Authentication tab">
        <Tab label="Sign In" />
        <Tab label="Create Account" />
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
        onChange={(e) => { setEmail(e.target.value); clearState(); setShowResend(false); }}
        fullWidth
        autoComplete="email"
        inputProps={{ "aria-label": "Email address" }}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />

      {/* Password + strength */}
      <Box>
        <TextField
          label="Password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => { setPassword(e.target.value); clearState(); }}
          fullWidth
          autoComplete={isRegister ? "new-password" : "current-password"}
          inputProps={{ "aria-label": "Password" }}
          onKeyDown={(e) => e.key === "Enter" && !isRegister && handleSubmit()}
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
        {isRegister && <PasswordStrength password={password} />}
      </Box>

      {/* Confirm password — registration only */}
      {isRegister && (
        <TextField
          label="Confirm password"
          type={showConfirm ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); clearState(); }}
          fullWidth
          autoComplete="new-password"
          inputProps={{ "aria-label": "Confirm password" }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          error={confirmMismatch}
          helperText={
            confirmMismatch
              ? "Passwords do not match."
              : confirmMatch
                ? "Passwords match."
                : ""
          }
          FormHelperTextProps={{
            sx: { color: confirmMatch ? "#169A43" : undefined, fontWeight: confirmMatch ? 600 : undefined },
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                {confirmMatch && <CheckCircleIcon sx={{ fontSize: 18, color: "#169A43", mr: 0.5 }} />}
                {confirmMismatch && <CancelIcon sx={{ fontSize: 18, color: "#EF2A2A", mr: 0.5 }} />}
                <IconButton
                  aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                  onClick={() => setShowConfirm((v) => !v)}
                  edge="end"
                  size="small"
                >
                  {showConfirm ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      )}

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Resend verification */}
      {showResend && registeredEmail && (
        <ResendButton email={registeredEmail} />
      )}

      <Button
        variant="contained"
        fullWidth
        onClick={handleSubmit}
        disabled={submitDisabled}
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
          maxHeight: "92vh",
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
        {user ? (
          <SignedInView user={user} state={state} dispatch={dispatch} />
        ) : (
          <>
            <AviaryTeaser />
            <EmailAuthForm dispatch={dispatch} onClose={handleClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
