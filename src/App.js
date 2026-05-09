import { useState, useRef, useEffect } from "react";
import "./App.css";
import SourceInput from "./components/SourceInput";
import SearchBox from "./components/SearchBox";
import ResultDisplay from "./components/ResultDisplay";
import Auth from "./components/Auth";
import { supabase } from "./lib/supabaseClient";
import { Menu, X, Plus, Search, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Clock, Pencil, Trash2, Upload, LogOut, User, Mail, MoreVertical, Flag, Send, ImagePlus, Check, Copy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Report Problem Modal ──
function ReportModal({ isOpen, onClose, userEmail }) {
  const [message, setMessage] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const fileRef = useRef(null);

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSend = async () => {
    if (!message.trim() || !image) return;
    setSending(true);
    // Open Gmail compose in new tab with To, Subject, Body pre-filled
    const subject = encodeURIComponent("PaperBrain — Problem Report");
    const body = encodeURIComponent(
      `Problem reported by: ${userEmail || "Guest"}\n\n${message}\n\n[Please attach the screenshot to this email before sending]`
    );
    window.open(
      `https://mail.google.com/mail/?view=cm&fs=1&to=paperbrain.support@gmail.com&su=${subject}&body=${body}`,
      "_blank"
    );
    setSending(false);
    setSent(true);
    setTimeout(() => { setSent(false); onClose(); setMessage(""); setImage(null); setImagePreview(null); }, 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center px-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-sm bg-[#0f0f0f] border border-white/10 rounded-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-red-400" />
                <span className="text-sm font-semibold text-foreground">Report a Problem</span>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Message box */}
              <div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe the problem you encountered..."
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-indigo-500/50 transition-colors resize-none"
                />
              </div>

              {/* Image upload — mandatory */}
              <div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
                {!imagePreview ? (
                  <button
                    onClick={() => fileRef.current.click()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/20 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-colors text-sm text-muted-foreground hover:text-indigo-400"
                  >
                    <ImagePlus className="w-4 h-4" />
                    Attach screenshot <span className="text-red-400 ml-0.5">*</span>
                  </button>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-white/10">
                    <img src={imagePreview} alt="Preview" className="w-full max-h-40 object-cover" />
                    <button
                      onClick={() => { setImage(null); setImagePreview(null); }}
                      className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {!image && <p className="text-[10px] text-red-400/70 mt-1.5 px-1">Screenshot is required</p>}
              </div>

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!message.trim() || !image || sending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                {sent ? (
                  <><Check className="w-4 h-4" /> Sent!</>
                ) : (
                  <><Send className="w-4 h-4" /> Send Report</>
                )}
              </button>

              <p className="text-[10px] text-muted-foreground/40 text-center">
                Opens Gmail with the report pre-filled. Please attach the screenshot before sending.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── About / Contact slide panel ──
function AboutPanel({ isOpen, onClose, scrollToContact }) {
  const contactRef = useRef(null);
  const [highlighted, setHighlighted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && scrollToContact) {
      setTimeout(() => {
        contactRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlighted(true);
        setTimeout(() => setHighlighted(false), 1000);
      }, 300);
    }
  }, [isOpen, scrollToContact]);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("paperbrain.support@gmail.com");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="fixed left-0 top-0 bottom-0 w-80 z-50 bg-[#0a0a0a] border-r border-white/10 flex flex-col overflow-y-auto"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <span className="text-xs text-muted-foreground font-medium tracking-wide uppercase">Info</span>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center px-6 py-8 gap-4 flex-1">
              <img src="/logo.png" alt="PaperBrain" className="w-20 h-20 object-contain" />
              <h2 className="text-2xl font-bold text-foreground">
                Paper<span className="text-indigo-400">Brain</span>
              </h2>
              <div className="w-full h-px bg-white/10 my-2" />

              {/* About us */}
              <div className="w-full">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">About us</h3>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  PaperBrain is an AI-powered document assistant that helps you understand, summarize, and interact with your PDFs — privately and securely.
                </p>
                <p className="text-sm text-foreground/60 leading-relaxed mt-3">
                  Built for students, researchers, and professionals who need to extract insights from documents quickly.
                </p>
              </div>

              <div className="w-full h-px bg-white/10 my-2" />

              {/* Contact */}
              <div className="w-full" ref={contactRef}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Contact</h3>

                <motion.div
                  animate={highlighted ? { backgroundColor: "rgba(99,102,241,0.15)" } : { backgroundColor: "rgba(255,255,255,0)" }}
                  transition={{ duration: 0.3 }}
                  className="rounded-xl p-1"
                >
                  {/* Email row — click to copy, hover shows tooltip */}
                  <div className="relative group">
                    <button
                      onClick={handleCopyEmail}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-colors text-left"
                    >
                      <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="text-sm text-foreground/80 truncate flex-1">paperbrain.support@gmail.com</span>
                      {copied
                        ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        : <Copy className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                      }
                    </button>

                    {/* Hover tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[#1a1a1a] border border-white/10 rounded-lg text-xs text-muted-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {copied ? "Copied!" : "Click to copy · Email us at paperbrain.support@gmail.com"}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1a1a1a]" />
                    </div>
                  </div>

                  {/* Gmail compose — opens Gmail in new tab with To pre-filled */}
                  <a
                    href="https://mail.google.com/mail/?view=cm&fs=1&to=paperbrain.support@gmail.com&su=PaperBrain%20Enquiry"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-colors text-xs text-muted-foreground hover:text-indigo-400"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Open in Gmail
                  </a>
                </motion.div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10">
              <p className="text-[10px] text-muted-foreground/40 text-center">PaperBrain · AI Document Assistant</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Three-dot user menu ──
function UserMenu({ user, onSignOut, onReport }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
        title="More options"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-1 w-44 bg-[#111] border border-white/10 rounded-xl overflow-hidden shadow-xl z-50"
          >
            <button
              onClick={() => { setOpen(false); onReport(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            >
              <Flag className="w-3.5 h-3.5 text-amber-400" />
              Report a problem
            </button>
            <div className="h-px bg-white/5 mx-2" />
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-muted-foreground hover:bg-white/5 hover:text-red-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Sidebar({ isOpen, onClose, onNewChat, sessions, setSessions, onSelectSession, onSelectPrompt, onDeleteSession, user, onSignOut, onReport }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSession, setExpandedSession] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");

  const filtered = sessions.filter(s =>
    s.prompts.some(p =>
      p.inputQuery?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.mode?.toLowerCase().includes(searchQuery.toLowerCase())
    ) || s.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const authHeaders = user ? { "X-User-Id": user.id } : {};

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-30 backdrop-blur-sm"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-72 z-40 bg-[#080808] border-r border-white/5 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="PaperBrain" className="w-7 h-7 object-contain" />
                <span className="text-sm font-semibold text-foreground">
                  Paper<span className="text-indigo-400">Brain</span>
                </span>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── CHANGED: user row now has three-dot menu ── */}
            {user && (
              <div className="px-3 py-3 border-b border-white/5">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <div className="w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    {user.user_metadata?.avatar_url
                      ? <img src={user.user_metadata.avatar_url} className="w-7 h-7 rounded-full object-cover" alt="avatar" />
                      : <User className="w-3.5 h-3.5 text-indigo-400" />
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">
                      {user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0]}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                  </div>
                  {/* Three-dot menu replaces the old LogOut button */}
                  <UserMenu user={user} onSignOut={onSignOut} onReport={onReport} />
                </div>
              </div>
            )}

            <div className="px-3 py-3 border-b border-white/5">
              <button
                onClick={() => { onNewChat(); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 transition-all text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                New Chat
              </button>
            </div>

            <div className="px-3 py-3 border-b border-white/5">
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  type="text" placeholder="Search sessions..."
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none w-full"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {filtered.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground/50">No sessions yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((session) => (
                    <div key={session.id} className="rounded-xl border border-white/5 overflow-hidden">
                      <button
                        onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-white/3 hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                          {editingId === session.id ? (
                            <input
                              autoFocus value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              onBlur={async () => {
                                setSessions(prev => prev.map(s => s.id === session.id ? { ...s, label: editLabel } : s));
                                setEditingId(null);
                                try {
                                  await axios.post(`${API}/sessions`, { id: session.id, label: editLabel, date: session.date, full_text: session.full_text, filename: session.filename }, { headers: authHeaders });
                                } catch (err) { console.error(err); }
                              }}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  setSessions(prev => prev.map(s => s.id === session.id ? { ...s, label: editLabel } : s));
                                  setEditingId(null);
                                  try {
                                    await axios.post(`${API}/sessions`, { id: session.id, label: editLabel, date: session.date, full_text: session.full_text, filename: session.filename }, { headers: authHeaders });
                                  } catch (err) { console.error(err); }
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="bg-white/10 text-xs text-foreground rounded px-1.5 py-0.5 outline-none border border-indigo-500/40 w-full"
                            />
                          ) : (
                            <span className="text-xs text-foreground truncate font-medium">{session.label}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="text-[10px] text-muted-foreground/50">{session.date}</span>
                          <button onClick={(e) => { e.stopPropagation(); setEditingId(session.id); setEditLabel(session.label); }}
                            className="p-1 rounded hover:bg-white/10 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                            className="p-1 rounded hover:bg-white/10 text-muted-foreground/50 hover:text-red-400 transition-colors">
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                          {expandedSession === session.id ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      </button>

                      <button onClick={() => { onSelectSession(session); onClose(); }}
                        className="w-full text-left px-3 py-1.5 bg-indigo-500/5 hover:bg-indigo-500/10 border-t border-white/5 transition-colors">
                        <span className="text-[10px] text-indigo-400">Open full session →</span>
                      </button>

                      <AnimatePresence>
                        {expandedSession === session.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }} className="overflow-hidden border-t border-white/5"
                          >
                            <div className="py-1">
                              {session.prompts.map((prompt, i) => (
                                <button key={i} onClick={() => { onSelectPrompt(session, i); onClose(); }}
                                  className="w-full text-left px-4 py-2 hover:bg-white/5 transition-colors group">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                      prompt.mode === "summarize" ? "bg-indigo-500/10 text-indigo-400" :
                                      prompt.mode === "question" ? "bg-cyan-500/10 text-cyan-400" :
                                      prompt.mode === "answer" ? "bg-amber-500/10 text-amber-400" :
                                      prompt.mode === "evaluate" ? "bg-emerald-500/10 text-emerald-400" :
                                      "bg-violet-500/10 text-violet-400"
                                    }`}>{prompt.mode}</span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground/60 truncate group-hover:text-muted-foreground transition-colors">
                                    {prompt.inputQuery || prompt.mode}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-white/5">
              <p className="text-[10px] text-muted-foreground/40 text-center">PaperBrain · AI Document Assistant</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [guestPromptCount, setGuestPromptCount] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showFullAuth, setShowFullAuth] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const [sourceText, setSourceText] = useState("");
  const [sourceInfo, setSourceInfo] = useState(null);
  const [multiSources, setMultiSources] = useState([]);
  const [results, setResults] = useState([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // ── Panel / modal state ──
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutScrollToContact, setAboutScrollToContact] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const bottomRef = useRef(null);
  const topRef = useRef(null);
  const chatRef = useRef(null);

  const getAuthHeaders = () => user ? { "X-User-Id": user.id } : {};
  const openAbout = () => { setAboutScrollToContact(false); setAboutOpen(true); };
  const openContact = () => { setAboutScrollToContact(true); setAboutOpen(true); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setShowAuthModal(false);
      setShowFullAuth(false);
      if (session?.user) { setIsGuest(false); setGuestPromptCount(0); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (user) fetchHistory(); }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null); setSessions([]); clearResults();
  };

  const handleGuestMode = () => { setIsGuest(true); setShowFullAuth(false); };

  const fetchHistory = async () => {
    try {
      const headers = getAuthHeaders();
      const sessionsRes = await axios.get(`${API}/sessions`, { headers });
      const savedSessions = sessionsRes.data || [];
      const historyRes = await axios.get(`${API}/history`, { headers });
      const historyItems = historyRes.data || [];

      const grouped = {};
      historyItems.forEach(item => {
        const key = item.session_id || `history-${new Date(item.timestamp).toLocaleDateString()}`;
        if (!grouped[key]) {
          const date = new Date(item.timestamp).toLocaleDateString();
          const name = item.query ? item.query.slice(0, 35) : item.source_preview ? item.source_preview.slice(0, 35) : date;
          grouped[key] = { id: key, label: name, date, prompts: [], full_text: item.full_text || "", filename: item.filename || "" };
        }
        let parsedImages = [];
        if (item.images_data) {
          try { parsedImages = typeof item.images_data === "string" ? JSON.parse(item.images_data) : item.images_data; } catch {}
        }
        let parsedSections = null;
        if (item.sections_data) {
          try {
            const raw = typeof item.sections_data === "string" ? JSON.parse(item.sections_data) : item.sections_data;
            if (Array.isArray(raw) && raw[0]?.sections) parsedSections = raw[0].sections;
            else if (Array.isArray(raw) && raw[0]?.text) parsedSections = raw;
          } catch {}
        }
        grouped[key].prompts.push({
          id: item.id, mode: item.mode, result: item.result, timestamp: item.timestamp,
          inputQuery: item.query, inputQuestion: item.question, inputAnswer: item.answer,
          sourceText: item.full_text || "", filename: item.filename || "",
          analyzed_images: parsedImages, sections: parsedSections,
        });
      });

      Object.keys(grouped).forEach(key => { grouped[key].prompts.reverse(); });
      const savedLabelsMap = {};
      savedSessions.forEach(s => { savedLabelsMap[s.session_id] = s; });
      const historySessions = Object.values(grouped).map(s => ({
        ...s,
        label: savedLabelsMap[s.id]?.label || s.label,
        full_text: savedLabelsMap[s.id]?.full_text || s.full_text,
        filename: savedLabelsMap[s.id]?.filename || s.filename,
      })).sort((a, b) => new Date(b.date) - new Date(a.date));
      setSessions(historySessions);
    } catch (err) { console.error("Failed to fetch history", err); }
  };

  useEffect(() => {
    if (results.length > 0 && (user || isGuest)) {
      const firstResult = results[0];
      const sessionId = currentSessionId || firstResult?.session_id || firstResult?.id || Date.now().toString();
      if (!currentSessionId) setCurrentSessionId(sessionId);
      const sessionLabel = sourceInfo?.filename || "New Session";
      const sessionDate = new Date().toLocaleDateString();
      setSessions(prev => {
        const existing = prev.find(s => s.id === sessionId);
        if (existing) return prev.map(s => s.id === sessionId ? { ...s, prompts: results } : s);
        else {
          if (user) {
            axios.post(`${API}/sessions`, { id: sessionId, label: sessionLabel, date: sessionDate, full_text: sourceText, filename: sourceInfo?.filename || "" }, { headers: getAuthHeaders() })
              .catch(err => console.error("Failed to save session", err));
          }
          return [{ id: sessionId, label: sessionLabel, date: sessionDate, prompts: results, full_text: sourceText, filename: sourceInfo?.filename || "" }, ...prev];
        }
      });
    }
  }, [results]);

  const handleResult = (result) => {
    if (isGuest && guestPromptCount >= 1) { setShowAuthModal(true); return; }
    if (!hasStarted) setHasStarted(true);
    const enrichedResult = { ...result, analyzed_images: result.analyzed_images || [], sections: result.sections || null };
    setResults((prev) => [...prev, enrichedResult]);
    if (isGuest) setGuestPromptCount(prev => prev + 1);
  };

  const handleRegenerate = (id, newResult) => {
    setResults(prev => prev.map(r => r.id === id ? {
      ...r, ...newResult,
      analyzed_images: newResult.analyzed_images || r.analyzed_images || [],
      sections: newResult.sections || r.sections || null,
    } : r));
  };

  const handleDeleteResult = async (id) => {
    setResults(prev => prev.filter(r => r.id !== id));
    try { await axios.delete(`${API}/history/${id}`, { headers: getAuthHeaders() }); } catch (err) { console.error(err); }
  };

  const clearResults = () => {
    setResults([]); setHasStarted(false); setSourceText("");
    setSourceInfo(null); setMultiSources([]); setCurrentSessionId(null);
  };

  const handleDeleteSession = async (sessionId) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    try { await axios.delete(`${API}/sessions/${sessionId}`, { headers: getAuthHeaders() }); } catch (err) { console.error(err); }
  };

  const restoreSession = (session) => {
    if (session.full_text) {
      setSourceText(session.full_text);
      setSourceInfo({ filename: session.filename || session.label, pages: null });
      setMultiSources([{ filename: session.filename || session.label, text: session.full_text, images: [] }]);
      return;
    }
    const firstWithText = session.prompts.find(p => p.sourceText);
    if (firstWithText) {
      setSourceText(firstWithText.sourceText);
      setSourceInfo({ filename: firstWithText.filename || session.label, pages: null });
      setMultiSources([{ filename: firstWithText.filename || session.label, text: firstWithText.sourceText, images: [] }]);
    } else if (!sourceText) {
      setSourceText("__session_restored__");
      setSourceInfo({ filename: session.label, pages: null });
    }
  };

  const handleSelectSession = (session) => {
    setHasStarted(true); setResults(session.prompts); setCurrentSessionId(session.id);
    restoreSession(session);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleSelectPrompt = (session, promptIndex) => {
    setHasStarted(true); setResults(session.prompts); setCurrentSessionId(session.id);
    restoreSession(session);
    setTimeout(() => {
      const cards = document.querySelectorAll("[data-testid^='result-card-']");
      if (cards[promptIndex]) cards[promptIndex].scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
  };

  const handleScroll = () => {
    const el = chatRef.current;
    if (!el) return;
    setShowScrollTop(el.scrollTop >= 100);
    setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight >= 150);
  };

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    setShowScrollTop(false); setShowScrollBottom(true);
  }, [hasStarted]);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setIsUploading(true);
    try {
      const newSources = [...multiSources];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await axios.post(`${API}/upload-pdf`, formData, { headers: { "Content-Type": "multipart/form-data" } });
        if (!newSources.find(s => s.filename === res.data.filename)) {
          newSources.push({ filename: res.data.filename, text: res.data.text, pages: res.data.pages, images: res.data.images || [] });
        }
      }
      setMultiSources(newSources);
      setSourceText(newSources.map(s => s.text).join("\n\n"));
      setSourceInfo({
        filename: newSources.length === 1 ? newSources[0].filename : `${newSources.length} documents`,
        pages: newSources.reduce((a, s) => a + (s.pages || 0), 0)
      });
    } catch (err) { alert("Failed to upload PDF"); }
    finally { setIsUploading(false); e.target.value = ""; }
  };

  useEffect(() => {
    if (hasStarted) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [results, hasStarted]);

  // ── Loading state ──
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="PaperBrain" className="w-10 h-10 object-contain animate-pulse" />
          <span className="text-foreground font-semibold">PaperBrain</span>
        </div>
      </div>
    );
  }

  // ── Full auth screen ──
  if (!user && !isGuest) {
    return (
      <div className="app-bg">
        <div className="noise-overlay" />
        <AboutPanel isOpen={aboutOpen} onClose={() => setAboutOpen(false)} scrollToContact={aboutScrollToContact} />

        <div className="relative z-10 w-full flex items-center justify-center px-4" style={{ minHeight: "100vh" }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <div className="flex items-center gap-4 mb-5 px-1">
              <img src="/logo.png" alt="PaperBrain" className="w-16 h-16 object-contain" />
              <span className="text-4xl font-bold text-foreground">
                Paper<span className="text-indigo-400">Brain</span>
              </span>
            </div>

            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-6">
                <Auth />
                <div className="mt-4 pt-4 border-t border-white/5 text-center">
                  <button onClick={handleGuestMode} className="text-xs text-muted-foreground hover:text-indigo-400 transition-colors">
                    Try as guest <span className="text-muted-foreground/50">(1 free prompt)</span>
                  </button>
                </div>
              </div>
              <div className="border-t border-white/10 bg-white/[0.02] px-6 py-4 flex items-center justify-center gap-5">
                <button onClick={openAbout} className="text-xs text-muted-foreground hover:text-indigo-400 transition-colors">About us</button>
                <button onClick={openContact} className="text-xs text-muted-foreground hover:text-indigo-400 transition-colors">Contact</button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const HamburgerButton = () => (
    <button onClick={() => setSidebarOpen(true)}
      className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
      <Menu className="w-4 h-4" />
    </button>
  );

  return (
    <div className="app-bg">
      <div className="noise-overlay" />

      <AboutPanel isOpen={aboutOpen} onClose={() => setAboutOpen(false)} scrollToContact={aboutScrollToContact} />
      <ReportModal isOpen={reportOpen} onClose={() => setReportOpen(false)} userEmail={user?.email} />

      <AnimatePresence>
        {showAuthModal && <Auth isModal={true} onClose={() => setShowAuthModal(false)} />}
      </AnimatePresence>

      <Sidebar
        isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}
        onNewChat={() => clearResults()} sessions={sessions} setSessions={setSessions}
        onSelectSession={handleSelectSession} onSelectPrompt={handleSelectPrompt}
        onDeleteSession={handleDeleteSession} user={user} onSignOut={handleSignOut}
        onReport={() => setReportOpen(true)}
      />

      <div className="fixed top-4 left-4 z-20"><HamburgerButton /></div>

      {isGuest && (
        <div className="fixed top-0 left-0 right-0 z-30 bg-indigo-600/20 border-b border-indigo-500/20 px-4 py-2 text-center">
          <span className="text-xs text-indigo-300">
            You're in guest mode — {guestPromptCount >= 1 ? "Sign in to continue using PaperBrain" : "1 free prompt remaining"}
            {" "}
            <button onClick={() => setShowAuthModal(true)} className="underline hover:text-white transition-colors">Sign in now</button>
          </span>
        </div>
      )}

      {hasStarted && (
        <>
          <AnimatePresence>
            {showScrollTop && (
              <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => chatRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                className="fixed right-6 bottom-52 z-30 w-8 h-8 rounded-full bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/20 flex items-center justify-center text-indigo-400 transition-colors">
                <ArrowUp className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showScrollBottom && (
              <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="fixed right-6 bottom-40 z-30 w-8 h-8 rounded-full bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/20 flex items-center justify-center text-indigo-400 transition-colors">
                <ArrowDown className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </>
      )}

      <div className="relative z-10" style={{ paddingTop: isGuest ? "36px" : "0" }}>
        <AnimatePresence>
          {!hasStarted && (
            <motion.div key="centered" initial={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}
              className="min-h-screen flex flex-col items-center justify-center px-4 pb-8">
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center mb-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <img src="/logo.png" alt="PaperBrain" className="w-16 h-16 object-contain" />
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Paper<span className="text-indigo-400">Brain</span>
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">Your private AI document assistant</p>
                {user && (
                  <p className="text-xs text-indigo-400/70 mt-2">
                    Welcome, {user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0]}! 👋
                  </p>
                )}
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }} className="w-full max-w-3xl mb-4">
                <SourceInput sourceText={sourceText} setSourceText={setSourceText} sourceInfo={sourceInfo} setSourceInfo={setSourceInfo} onMultiSource={setMultiSources} />
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }} className="w-full max-w-3xl">
                <SearchBox sourceText={sourceText} multiSources={multiSources} onResult={handleResult} disabled={!sourceText} results={results} sessionId={currentSessionId} userId={user?.id} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {hasStarted && (
          <div className="min-h-screen flex flex-col relative">
            <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
              className="flex items-center justify-between px-4 py-3 border-b border-white/5 backdrop-blur-md sticky top-0 z-20 bg-[#050505]/80">
              <div className="flex items-center gap-3">
                <div className="w-8" />
                <img src="/logo.png" alt="PaperBrain" className="w-7 h-7 object-contain" />
                <span className="text-sm font-semibold text-foreground">Paper<span className="text-indigo-400">Brain</span></span>
              </div>
              <div className="flex items-center gap-3">
                {sourceInfo && <span className="text-xs text-muted-foreground truncate max-w-[150px]">📄 {sourceInfo.filename}</span>}
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-indigo-500/30 cursor-pointer transition-colors text-xs text-muted-foreground hover:text-indigo-400">
                  {isUploading ? <span className="loading-pulse">Uploading...</span> : <><Upload className="w-3.5 h-3.5" /><span>{multiSources.length > 0 ? "Add doc" : "Upload doc"}</span></>}
                  <input type="file" accept=".pdf" multiple className="hidden" onChange={handleFileUpload} />
                </label>
                {!user && isGuest && (
                  <button onClick={() => setShowAuthModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs hover:bg-indigo-600/40 transition-colors">
                    Sign in
                  </button>
                )}
              </div>
            </motion.header>

            <div ref={chatRef} onScroll={handleScroll} className="overflow-y-auto px-4 sm:px-6 py-6 pb-64 absolute inset-0 top-[52px] bottom-0">
              <div ref={topRef} />
              <div className="max-w-5xl mx-auto space-y-4">
                <ResultDisplay results={results} onClear={clearResults} sourceText={sourceText} multiSources={multiSources} onRegenerate={handleRegenerate} onDelete={handleDeleteResult} />
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent pt-8 pb-6 px-4">
              <div className="max-w-3xl mx-auto">
                <SearchBox sourceText={sourceText} multiSources={multiSources} onResult={handleResult} disabled={!sourceText} results={results} sessionId={currentSessionId} userId={user?.id} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;