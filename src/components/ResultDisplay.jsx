import { useState } from "react";
import { FileSearch, MessageSquareQuote, PenLine, CheckCircle, AlertCircle, Trash2, Copy, Check, GitMerge, ThumbsUp, ThumbsDown, RefreshCw, Send } from "lucide-react";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import ReactMarkdown from "react-markdown";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODE_CONFIG = {
  summarize: { icon: FileSearch, label: "Summary", color: "text-indigo-400", bg: "bg-indigo-500/10" },
  question: { icon: MessageSquareQuote, label: "Questions", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  answer: { icon: PenLine, label: "Answer", color: "text-amber-400", bg: "bg-amber-500/10" },
  evaluate: { icon: CheckCircle, label: "Evaluation", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  auto: { icon: MessageSquareQuote, label: "Response", color: "text-violet-400", bg: "bg-violet-500/10" },
};

function parseResult(result) {
  if (!result) return "";
  // Handle array format: [{"filename": "...", "result": "..."}]
  try {
    // Try parsing as JSON array
    let parsed = result;
    if (typeof result === "string") {
      // Replace single quotes with double quotes for Python-style dicts
      parsed = JSON.parse(result.replace(/'/g, '"'));
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Return first result's text
      return parsed[0]?.result || parsed[0]?.text || String(parsed[0]) || "";
    }
    if (typeof parsed === "object" && parsed?.result) {
      return parsed.result;
    }
  } catch {}
  // Return as-is if not JSON
  return typeof result === "string" ? result : String(result);
}

// ── Markdown renderer ──
function MarkdownContent({ content }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold text-foreground mt-4 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold text-foreground mt-3 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground/90 mt-2 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-sm text-foreground/90 leading-relaxed mb-2">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
        ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2 text-sm text-foreground/90">{children}</ul>,
        ol: ({ children, start }) => <ol start={start} className="list-decimal space-y-1 mb-2 text-sm text-foreground/90 pl-5">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-foreground/90 leading-relaxed pl-1">{children}</li>,
        code: ({ inline, children }) =>
          inline
            ? <code className="bg-white/10 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
            : <pre className="bg-white/5 border border-white/10 rounded-lg p-3 overflow-x-auto text-xs font-mono text-foreground/80 mb-2"><code>{children}</code></pre>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-indigo-500/50 pl-3 italic text-foreground/70 mb-2">{children}</blockquote>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Inline image component ──
function InlineImage({ image }) {
  if (!image || !image.data) return null;
  return (
    <div className="my-3">
      <div
        className="relative group/img rounded-lg overflow-hidden border border-white/10 bg-white/3 cursor-pointer inline-block max-w-sm"
        onClick={() => {
          const win = window.open("", "_blank");
          win.document.write(`<html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="data:image/png;base64,${image.data}" style="max-width:100%;max-height:100vh;object-fit:contain"/></body></html>`);
        }}
      >
        <img
          src={`data:image/png;base64,${image.data}`}
          alt={`Page ${image.page} diagram`}
          className="max-h-48 object-contain p-1"
        />
        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover/img:opacity-100 text-[10px] text-white bg-black/60 px-2 py-1 rounded transition-opacity">
            Click to expand
          </span>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground/50 mt-1">Page {image.page}</p>
    </div>
  );
}

// ── Interleaved sections renderer ──
function SectionedContent({ sections, fallbackText }) {
  // If sections available — render interleaved text + image
  if (sections && sections.length > 0) {
    return (
      <div className="space-y-4">
        {sections.map((section, i) => (
          <div key={i} className="space-y-1">
            {section.heading && (
              <h2 className="text-sm font-bold text-foreground mt-3 mb-1">{section.heading}</h2>
            )}
            <MarkdownContent content={section.text} />
            {section.image && <InlineImage image={section.image} />}
            {i < sections.length - 1 && section.heading && (
              <hr className="border-white/5 mt-3" />
            )}
          </div>
        ))}
      </div>
    );
  }

  // Fallback — plain markdown
  return <MarkdownContent content={parseResult(fallbackText)} />;
}

// ── Copy button ──
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(parseResult(text));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors text-[11px]"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

// ── Feedback bar ──
function FeedbackBar({ result, sourceText, multiSources, onRegenerate }) {
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [showFeedbackBox, setShowFeedbackBox] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleLike = async () => {
    setLiked(true); setDisliked(false); setShowFeedbackBox(false);
    try { await axios.post(`${API}/feedback`, { result_id: result.id, feedback: "up" }); }
    catch (err) { console.error(err); }
  };

  const handleDislike = () => { setDisliked(true); setLiked(false); setShowFeedbackBox(true); };

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim()) return;
    setIsRegenerating(true); setShowFeedbackBox(false);
    try {
      await axios.post(`${API}/feedback`, { result_id: result.id, feedback: "down", comment: feedbackText });
      const texts = multiSources?.length > 0
        ? multiSources.map(s => ({ filename: s.filename, text: s.text }))
        : [{ filename: "Document", text: sourceText }];
      const res = await axios.post(`${API}/regenerate`, {
        texts, mode: result.mode,
        previous_response: parseResult(result.result),
        feedback_comment: feedbackText,
        query: result.inputQuery,
        question: result.inputQuestion,
        answer: result.inputAnswer,
        images: result.analyzed_images?.map(img => ({ data: img.data, page: img.page })) || [],
      });
      onRegenerate(result.id, {
        ...res.data,
        inputQuery: result.inputQuery,
        inputQuestion: result.inputQuestion,
        inputAnswer: result.inputAnswer,
        analyzed_images: res.data.analyzed_images || result.analyzed_images || [],
        sections: res.data.sections || null,
        is_regenerated: true,
      });
      setFeedbackText("");
    } catch (err) { console.error(err); }
    finally { setIsRegenerating(false); }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const texts = multiSources?.length > 0
        ? multiSources.map(s => ({ filename: s.filename, text: s.text }))
        : [{ filename: "Document", text: sourceText }];
      const res = await axios.post(`${API}/regenerate`, {
        texts, mode: result.mode,
        previous_response: parseResult(result.result),
        query: result.inputQuery,
        question: result.inputQuestion,
        answer: result.inputAnswer,
        images: result.analyzed_images?.map(img => ({ data: img.data, page: img.page })) || [],
      });
      onRegenerate(result.id, {
        ...res.data,
        inputQuery: result.inputQuery,
        inputQuestion: result.inputQuestion,
        inputAnswer: result.inputAnswer,
        analyzed_images: res.data.analyzed_images || result.analyzed_images || [],
        sections: res.data.sections || null,
        is_regenerated: true,
      });
    } catch (err) { console.error(err); }
    finally { setIsRegenerating(false); }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1 border-t border-white/5 pt-2">
        <button onClick={handleLike} className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors text-[11px] ${liked ? "text-emerald-400 bg-emerald-500/10" : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"}`}>
          <ThumbsUp className="w-3.5 h-3.5" /><span>Like</span>
        </button>
        <button onClick={handleDislike} className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors text-[11px] ${disliked ? "text-red-400 bg-red-500/10" : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10"}`}>
          <ThumbsDown className="w-3.5 h-3.5" /><span>Dislike</span>
        </button>
        <button onClick={handleRegenerate} disabled={isRegenerating} className="flex items-center gap-1 px-2 py-1 rounded-lg text-muted-foreground hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors text-[11px] disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
          <span>{isRegenerating ? "Regenerating..." : "Regenerate"}</span>
        </button>
        <CopyButton text={result.result} />
        {result.is_regenerated && (
          <span className="ml-auto text-[10px] text-indigo-400/70 bg-indigo-500/10 px-2 py-0.5 rounded-full">Regenerated</span>
        )}
      </div>
      <AnimatePresence>
        {showFeedbackBox && (
          <motion.div
            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            className="mt-2 flex items-center gap-2 bg-white/3 rounded-xl border border-white/10 px-3 py-2"
          >
            <span className="text-xs text-muted-foreground/70 shrink-0">How to improve?</span>
            <input
              autoFocus type="text" value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleFeedbackSubmit(); }}
              placeholder="What's wrong with this response?"
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none"
            />
            <button onClick={handleFeedbackSubmit} disabled={!feedbackText.trim() || isRegenerating}
              className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 disabled:opacity-30 transition-colors">
              <Send className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Result card ──
function ResultCard({ result, index, sourceText, multiSources, onRegenerate, onDelete }) {
  const config = MODE_CONFIG[result.mode] || MODE_CONFIG.summarize;
  const Icon = result.error ? AlertCircle : result.is_combined ? GitMerge : config.icon;
  const isError = result.error;
  const isCombined = result.is_combined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="glass-card rounded-xl p-5 group relative"
      data-testid={`result-card-${result.id}`}
    >
      <button
        onClick={() => onDelete(result.id)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground/50 hover:text-red-400"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-8 h-8 rounded-lg ${isError ? "bg-red-500/10" : isCombined ? "bg-violet-500/10" : config.bg} flex items-center justify-center mt-0.5`}>
          <Icon className={`w-4 h-4 ${isError ? "text-red-400" : isCombined ? "text-violet-400" : config.color}`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`mode-label ${isError ? "text-red-400" : isCombined ? "text-violet-400" : config.color}`}>
              {isError ? "Error" : isCombined ? "Combined Summary" : config.label}
            </span>
            {result.filename && !isCombined && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/5">
                {result.filename}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/50 ml-auto mr-6">
              {new Date(result.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {result.inputQuery && (
            <p className="text-xs text-muted-foreground mb-3 italic">Q: {result.inputQuery}</p>
          )}

          {result.mode === "evaluate" && (result.inputQuestion || result.inputAnswer) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {result.inputQuestion && (
                <div className="bg-white/3 rounded-lg p-2.5 border border-white/5">
                  <span className="mode-label text-indigo-400 block mb-1">Question</span>
                  <p className="text-xs text-muted-foreground">{result.inputQuestion}</p>
                </div>
              )}
              {result.inputAnswer && (
                <div className="bg-white/3 rounded-lg p-2.5 border border-white/5">
                  <span className="mode-label text-emerald-400 block mb-1">Answer</span>
                  <p className="text-xs text-muted-foreground">{result.inputAnswer}</p>
                </div>
              )}
            </div>
          )}

          {/* Interleaved sections (text + image per section) */}
          <SectionedContent
            sections={result.sections}
            fallbackText={result.result}
          />

          {!isError && (
            <FeedbackBar
              result={result}
              sourceText={sourceText}
              multiSources={multiSources}
              onRegenerate={onRegenerate}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function ResultDisplay({ results, onClear, sourceText, multiSources, onRegenerate, onDelete }) {
  if (results.length === 0) return null;
  return (
    <div className="w-full" data-testid="result-display">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={onClear}
          className="text-xs text-muted-foreground hover:text-red-400 h-7 ml-auto">
          <Trash2 className="w-3 h-3 mr-1" /> Clear all
        </Button>
      </div>
      <AnimatePresence>
        <div className="space-y-4 pb-4">
          {results.map((r, i) => (
            <ResultCard key={r.id} result={r} index={i}
              sourceText={sourceText} multiSources={multiSources}
              onRegenerate={onRegenerate} onDelete={onDelete}
            />
          ))}
        </div>
      </AnimatePresence>
    </div>
  );
}