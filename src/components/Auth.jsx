import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import { Mail, Lock, Eye, EyeOff, Github, Loader2, X } from "lucide-react";

export default function Auth({ onClose, isModal = false }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleEmailAuth = async () => {
    if (!email || !password) return;
    setLoading(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage({ type: "success", text: "Check your email for a confirmation link!" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setMessage({ type: "error", text: "Please enter your email address first." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}`,
      });
      if (error) throw error;
      setMessage({ type: "success", text: "Password reset link sent! Check your email." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
    if (error) { setMessage({ type: "error", text: error.message }); setLoading(false); }
  };

  const handleGitHubSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin }
    });
    if (error) { setMessage({ type: "error", text: error.message }); setLoading(false); }
  };

  const content = (
    <div style={{ width: "100%", maxWidth: "400px", margin: "0 auto" }}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="PaperBrain" className="w-8 h-8 object-contain" />
          <span className="text-lg font-semibold text-foreground">
            Paper<span className="text-indigo-400">Brain</span>
          </span>
        </div>
        {isModal && onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <h2 className="text-xl font-semibold text-foreground mb-1">
        {mode === "signin" ? "Welcome" : mode === "signup" ? "Create account" : "Reset password"}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {mode === "signin" ? "Sign in to access your documents and history" :
         mode === "signup" ? "Start using PaperBrain for free" :
         "Enter your email to receive a reset link"}
      </p>

      {/* OAuth buttons */}
      {mode !== "reset" && (
        <div className="space-y-2 mb-4">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm text-foreground disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <button
            onClick={handleGitHubSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm text-foreground disabled:opacity-50"
          >
            <Github className="w-4.5 h-4.5" />
            Continue with GitHub
          </button>
        </div>
      )}

      {mode !== "reset" && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>
      )}

      {/* Email + Password */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && mode !== "reset") handleEmailAuth(); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>

        {mode !== "reset" && (
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleEmailAuth(); }}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-indigo-500/50 transition-colors"
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`text-xs px-3 py-2 rounded-lg mb-3 ${
          message.type === "success"
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            : "bg-red-500/10 text-red-400 border border-red-500/20"
        }`}>
          {message.text}
        </div>
      )}

      {/* Primary action button */}
      <button
        onClick={mode === "reset" ? handlePasswordReset : handleEmailAuth}
        disabled={loading || !email || (mode !== "reset" && !password)}
        className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
      </button>

      {/* Auth mode links */}
      <div className="mt-4 text-center space-y-2">
        {mode === "signin" && (
          <>
            <button onClick={() => { setMode("reset"); setMessage(null); }}
              className="text-xs text-muted-foreground hover:text-indigo-400 transition-colors block w-full">
              Forgot password?
            </button>
            <p className="text-xs text-muted-foreground">
              Don't have an account?{" "}
              <button onClick={() => { setMode("signup"); setMessage(null); }}
                className="text-indigo-400 hover:text-indigo-300 transition-colors">
                Sign up
              </button>
            </p>
          </>
        )}
        {mode === "signup" && (
          <p className="text-xs text-muted-foreground">
            Already have an account?{" "}
            <button onClick={() => { setMode("signin"); setMessage(null); }}
              className="text-indigo-400 hover:text-indigo-300 transition-colors">
              Sign in
            </button>
          </p>
        )}
        {mode === "reset" && (
          <button onClick={() => { setMode("signin"); setMessage(null); }}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            ← Back to sign in
          </button>
        )}
      </div>
    </div>
  );

  // Modal mode — used for guest upgrade prompt
  if (isModal) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-4"
        onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-2xl p-6"
        >
          {content}
        </motion.div>
      </motion.div>
    );
  }

  // Non-modal: just return content — App.js owns the card shell
  return <>{content}</>;
}