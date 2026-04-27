import { useState } from "react";
import { FileSearch, MessageSquareQuote, PenLine, CheckCircle, AlertCircle, Trash2, Copy, Check, GitMerge, Image, ThumbsUp, ThumbsDown, RefreshCw, Send } from "lucide-react";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

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
  try {
    const parsed = JSON.parse(result.replace(/'/g, '"'));
    if (Array.isArray(parsed) && parsed[0]?.result) {
      return parsed[0].result;
    }
  } catch {}
  return result;
}

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
      title="Copy"
      className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors text-[11px]"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function ImageGallery({ images }) {
  const [expanded, setExpanded] = useState(false);
  if (!images || images.length === 0) return null;

  const byPage = images.reduce((acc, img) => {
    const p = img.page;
    if (!acc[p]) acc[p] = [];
    acc[p].push(img);
    return acc;
  }, {});

  const pages = Object.keys(byPage);
  const visiblePages = expanded ? pages : pages.slice(0, 2);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-2">
        <Image className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {images.length} image{images.length > 1 ? "s" : ""} from document
        </span>
      </div>

      {visiblePages.map((page) => (
        <div key={page}>
          <span className="text-[10px] text-muted-foreground/60 mb-1.5 block">Page {page}</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {byPage[page].map((img, i) => (
              <div
                key={i}
                className="relative group/img rounded-lg overflow-hidden border border-white/5 bg-white/3 cursor-pointer"
                onClick={() => {
                  const win = window.open("", "_blank");
                  win.document.write(`<html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="data:image/png;base64,${img.data}" style="max-width:100%;max-height:100vh;object-fit:contain"/></body></html>`);
                }}
              >
                <img
                  src={`data:image/png;base64,${img.data}`}
                  alt={`Page ${img.page} image ${i + 1}`}
                  className="w-full h-36 object-contain p-1"
                />
                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover/img:opacity-100 text-[10px] text-white bg-black/60 px-2 py-1 rounded transition-opacity">
                    Click to expand
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {pages.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {expanded ? "Show less" : `Show images from ${pages.length - 2} more pages`}
        </button>
      )}
    </div>
  );
}

function FeedbackBar({ result, sourceText, multiSources, onRegenerate }) {
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [showFeedbackBox, setShowFeedbackBox] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleLike = async () => {
    setLiked(true);
    setDisliked(false);
    setShowFeedbackBox(false);
    try {
      await axios.post(`${API}/feedback`, {
        result_id: result.id,
        feedback: "up",
      });
    } catch (err) {
      console.error("Failed to save feedback", err);
    }
  };

  const handleDislike = () => {
    setDisliked(true);
    setLiked(false);
    setShowFeedbackBox(true);
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim()) return;
    setIsRegenerating(true);
    setShowFeedbackBox(false);

    try {
      await axios.post(`${API}/feedback`, {
        result_id: result.id,
        feedback: "down",
        comment: feedbackText,
      });

      const texts = multiSources && multiSources.length > 0
        ? multiSources.map(s => ({ filename: s.filename, text: s.text }))
        : [{ filename: "Document", text: sourceText }];

      const res = await axios.post(`${API}/regenerate`, {
        texts,
        mode: result.mode,
        previous_response: parseResult(result.result),
        feedback_comment: feedbackText,
        query: result.inputQuery,
        question: result.inputQuestion,
        answer: result.inputAnswer,
      });

      onRegenerate(result.id, {
        ...res.data,
        inputQuery: result.inputQuery,
        inputQuestion: result.inputQuestion,
        inputAnswer: result.inputAnswer,
        images: result.images,
        is_regenerated: true,
      });

      setFeedbackText("");
    } catch (err) {
      console.error("Failed to regenerate", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const texts = multiSources && multiSources.length > 0
        ? multiSources.map(s => ({ filename: s.filename, text: s.text }))
        : [{ filename: "Document", text: sourceText }];

      const res = await axios.post(`${API}/regenerate`, {
        texts,
        mode: result.mode,
        previous_response: parseResult(result.result),
        query: result.inputQuery,
        question: result.inputQuestion,
        answer: result.inputAnswer,
      });

      onRegenerate(result.id, {
        ...res.data,
        inputQuery: result.inputQuery,
        inputQuestion: result.inputQuestion,
        inputAnswer: result.inputAnswer,
        images: result.images,
        is_regenerated: true,
      });
    } catch (err) {
      console.error("Failed to regenerate", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1 border-t border-white/5 pt-2">
        <button
          onClick={handleLike}
          title="Like"
          className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors text-[11px] ${
            liked
              ? "text-emerald-400 bg-emerald-500/10"
              : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
          }`}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          <span>Like</span>
        </button>

        <button
          onClick={handleDislike}
          title="Dislike"
          className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors text-[11px] ${
            disliked
              ? "text-red-400 bg-red-500/10"
              : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
          }`}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
          <span>Dislike</span>
        </button>

        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          title="Regenerate"
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-muted-foreground hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors text-[11px] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
          <span>{isRegenerating ? "Regenerating..." : "Regenerate"}</span>
        </button>

        <CopyButton text={result.result} />

        {result.is_regenerated && (
          <span className="ml-auto text-[10px] text-indigo-400/70 bg-indigo-500/10 px-2 py-0.5 rounded-full">
            Regenerated
          </span>
        )}
      </div>

      <AnimatePresence>
        {showFeedbackBox && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
            className="mt-2 flex items-center gap-2 bg-white/3 rounded-xl border border-white/10 px-3 py-2"
          >
            <span className="text-xs text-muted-foreground/70 shrink-0">How may I help?</span>
            <input
              autoFocus
              type="text"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFeedbackSubmit();
              }}
              placeholder="What's wrong with this response?"
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none"
            />
            <button
              onClick={handleFeedbackSubmit}
              disabled={!feedbackText.trim() || isRegenerating}
              className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 disabled:opacity-30 transition-colors"
            >
              <Send className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResultCard({ result, index, sourceText, multiSources, onRegenerate, onDelete }) {
  const config = MODE_CONFIG[result.mode] || MODE_CONFIG.summarize;
  const Icon = result.error ? AlertCircle : result.is_combined ? GitMerge : config.icon;
  const isError = result.error;
  const isCombined = result.is_combined;
  const displayResult = parseResult(result.result);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="glass-card rounded-xl p-5 group relative"
      data-testid={`result-card-${result.id}`}
    >
      {/* Delete button top right */}
      <button
        onClick={() => onDelete(result.id)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground/50 hover:text-red-400"
        title="Delete"
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
            <p className="text-xs text-muted-foreground mb-2 italic">
              Q: {result.inputQuery}
            </p>
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

          <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {displayResult}
          </div>

          {result.mode === "summarize" && (
           <ImageGallery images={result.images} />
          )}

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
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-red-400 h-7 ml-auto"
        >
          <Trash2 className="w-3 h-3 mr-1" /> Clear all
        </Button>
      </div>
      <AnimatePresence>
        <div className="space-y-4 pb-4">
          {results.map((r, i) => (
            <ResultCard
              key={r.id}
              result={r}
              index={i}
              sourceText={sourceText}
              multiSources={multiSources}
              onRegenerate={onRegenerate}
              onDelete={onDelete}
            />
          ))}
        </div>
      </AnimatePresence>
    </div>
  );
}