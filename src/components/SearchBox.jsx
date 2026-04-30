import { useState } from "react";
import { Send, Loader2, FileSearch, MessageSquareQuote, PenLine, CheckCircle, MessageCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "./ui/select";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODES = [
  { value: "summarize", label: "Summarize", icon: FileSearch, desc: "Condense text into key points" },
  { value: "question", label: "Question", icon: MessageSquareQuote, desc: "Generate questions from text" },
  { value: "answer", label: "Answer", icon: PenLine, desc: "Answer a question from text" },
  { value: "evaluate", label: "Evaluate", icon: CheckCircle, desc: "Evaluate Q&A correctness" },
  { value: "auto", label: "Chat", icon: MessageCircle, desc: "Type your own prompt freely" },
];

export default function SearchBox({ sourceText, multiSources, onResult, disabled, results, sessionId }) {
  const [mode, setMode] = useState("summarize");
  const [query, setQuery] = useState("");
  const [evalQuestion, setEvalQuestion] = useState("");
  const [evalAnswer, setEvalAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const currentMode = MODES.find((m) => m.value === mode);
  const isRestored = sourceText === "__session_restored__";

  const getPlaceholder = () => {
    switch (mode) {
      case "summarize": return "Click send to summarize the loaded text...";
      case "question": return "Click send or type 'give me 7 questions'...";
      case "answer": return "Type your question about the text...";
      case "auto": return 'Type freely: "summarize", "give me 10 questions", "what is X?", "evaluate it"...';
      default: return "";
    }
  };

  const canSubmit = () => {
    if (!sourceText || isLoading) return false;
    if (isRestored && mode !== "auto" && mode !== "answer" && mode !== "question") return false;
    if (mode === "answer") return query.trim().length > 0;
    if (mode === "evaluate") return evalQuestion.trim().length > 0 && evalAnswer.trim().length > 0;
    if (mode === "auto") return query.trim().length > 0;
    return true;
  };

  const buildTexts = () => {
    if (multiSources && multiSources.length > 0) {
      return multiSources.map(s => ({ filename: s.filename, text: s.text, images: s.images || [] }));
    }
    if (isRestored) {
      return [{ filename: "Document", text: "", images: [] }];
    }
    return [{ filename: "Document", text: sourceText, images: [] }];
  };

  const buildHistory = () => {
    if (!results || results.length === 0) return [];
    return results.slice(-5).map(r => ({
      inputQuery: r.inputQuery || "",
      result: r.result || "",
      mode: r.mode || "",
    }));
  };

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    setIsLoading(true);
    try {
      const payload = {
        texts: buildTexts(),
        mode: mode,
        session_id: sessionId || null,
        query: mode === "auto" || mode === "answer" || mode === "question" ? query : undefined,
        question: mode === "evaluate" ? evalQuestion : undefined,
        answer: mode === "evaluate" ? evalAnswer : undefined,
        history: buildHistory(),
        images: multiSources?.flatMap(s => s.images || []) || [],
      };

      const res = await axios.post(`${API}/process`, payload);
      const analyzedImages = res.data.analyzed_images || [];

      if (res.data.results && res.data.results.length > 1) {
        res.data.results.forEach((r) => {
          onResult({
            id: `${res.data.id}-${r.filename}`,
            mode: res.data.mode,
            result: r.result,
            filename: r.filename,
            is_combined: r.is_combined || false,
            timestamp: res.data.timestamp,
            inputQuery: query,
            inputQuestion: evalQuestion,
            inputAnswer: evalAnswer,
            images: multiSources?.find(s => s.filename === r.filename)?.images || [],
            analyzed_images: analyzedImages,
            sections: r.sections || null,
          });
        });
      } else {
        const r = res.data.results[0];
        onResult({
          id: res.data.id,
          mode: res.data.mode,
          result: r.result,
          filename: r.filename,
          timestamp: res.data.timestamp,
          inputQuery: query,
          inputQuestion: evalQuestion,
          inputAnswer: evalAnswer,
          images: multiSources?.find(s => s.filename === r.filename)?.images || [],
          analyzed_images: analyzedImages,
          sections: r.sections || null,
        });
      }

      setQuery("");
      setEvalQuestion("");
      setEvalAnswer("");
    } catch (err) {
      const msg = err.response?.data?.detail || "Processing failed. Please try again.";
      onResult({
        mode,
        result: `Error: ${msg}`,
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        source_preview: "",
        error: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && mode !== "evaluate") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const suggestions = ["summarize", "give me 5 questions", "give me 10 questions", "evaluate it"];

  return (
    <div className="w-full max-w-3xl mx-auto" data-testid="search-box-container">
      <div className="hero-input-glow rounded-2xl border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="w-[160px] bg-white/5 border-white/10 rounded-full h-8 text-xs font-medium hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-2">
                {currentMode && <currentMode.icon className="w-3.5 h-3.5 text-indigo-400" />}
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0a] border-white/10">
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  <div className="flex items-center gap-2">
                    <m.icon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{m.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground hidden sm:block">{currentMode?.desc}</span>

          {multiSources && multiSources.length > 1 && (
            <span className="ml-auto text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
              {multiSources.length} docs
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          {mode === "evaluate" ? (
            <motion.div
              key="evaluate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5"
            >
              <div className="p-4">
                <label className="mode-label text-indigo-400 mb-2 block">Question</label>
                <Textarea
                  placeholder="Enter the question..."
                  className="min-h-[100px] bg-transparent border-0 focus-visible:ring-0 resize-none text-sm p-0 placeholder:text-white/20"
                  value={evalQuestion}
                  onChange={(e) => setEvalQuestion(e.target.value)}
                />
              </div>
              <div className="p-4">
                <label className="mode-label text-emerald-400 mb-2 block">Answer</label>
                <Textarea
                  placeholder="Enter the answer to evaluate..."
                  className="min-h-[100px] bg-transparent border-0 focus-visible:ring-0 resize-none text-sm p-0 placeholder:text-white/20"
                  value={evalAnswer}
                  onChange={(e) => setEvalAnswer(e.target.value)}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="standard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="p-4"
            >
              {mode === "auto" && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setQuery(s)}
                      className="text-xs px-3 py-1 rounded-full border border-white/10 text-muted-foreground hover:border-indigo-500/40 hover:text-indigo-400 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <Textarea
                placeholder={getPlaceholder()}
                className="min-h-[60px] max-h-[120px] bg-transparent border-0 focus-visible:ring-0 resize-none text-sm p-0 placeholder:text-white/20"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled || isLoading}
                data-testid="search-input"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            {isLoading && (
              <span className="text-xs text-indigo-400 flex items-center gap-1.5 loading-pulse">
                <Loader2 className="w-3 h-3 animate-spin" /> Processing... (30-60s)
              </span>
            )}
            {!sourceText && !isLoading && (
              <span className="text-xs text-amber-400/70">Load text first (PDF or paste)</span>
            )}
            {isRestored && !isLoading && (
              <span className="text-xs text-amber-400/70">Session restored — upload PDF to use all modes</span>
            )}
          </div>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit()}
            data-testid="submit-btn"
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-5 h-8 text-xs font-medium transition-all hover:shadow-lg hover:shadow-indigo-500/20 disabled:opacity-30"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span className="ml-1.5 hidden sm:inline">{isLoading ? "Processing" : "Send"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}