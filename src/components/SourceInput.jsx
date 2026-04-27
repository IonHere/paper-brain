import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Upload, X, ChevronUp, Clipboard, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SourceInput({ sourceText, setSourceText, sourceInfo, setSourceInfo, onMultiSource }) {
  const [isExpanded, setIsExpanded] = useState(!sourceText);
  const [isUploading, setIsUploading] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [sources, setSources] = useState([]);

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await axios.post(`${API}/upload-pdf`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) return;
    setIsUploading(true);
    try {
      const newSources = [...sources];
      for (const file of acceptedFiles) {
        const res = await uploadFile(file);
        if (!newSources.find(s => s.filename === res.filename)) {
          newSources.push({
            filename: res.filename,
            text: res.text,
            pages: res.pages,
            images: res.images || []
          });
        }
      }
      setSources(newSources);
      const combined = newSources.map(s => s.text).join("\n\n");
      setSourceText(combined);
      setSourceInfo({
        filename: newSources.length === 1
          ? newSources[0].filename
          : `${newSources.length} documents loaded`,
        pages: newSources.reduce((a, s) => a + (s.pages || 0), 0)
      });
      if (onMultiSource) onMultiSource(newSources);
      setIsExpanded(false);
      setPasteMode(false);
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to upload PDF";
      alert(msg);
    } finally {
      setIsUploading(false);
    }
  }, [sources, setSourceText, setSourceInfo, onMultiSource]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 10,
    disabled: isUploading,
  });

  const removeSource = (filename) => {
    const updated = sources.filter(s => s.filename !== filename);
    setSources(updated);
    if (updated.length === 0) {
      setSourceText("");
      setSourceInfo(null);
      setIsExpanded(true);
      if (onMultiSource) onMultiSource([]);
    } else {
      const combined = updated.map(s => s.text).join("\n\n");
      setSourceText(combined);
      setSourceInfo({
        filename: updated.length === 1 ? updated[0].filename : `${updated.length} documents loaded`,
        pages: updated.reduce((a, s) => a + (s.pages || 0), 0)
      });
      if (onMultiSource) onMultiSource(updated);
    }
  };

  const handlePasteSubmit = () => {
    if (sourceText.trim()) {
      const pastedSource = [{ filename: "Pasted Text", text: sourceText, pages: null, images: [] }];
      setSources(pastedSource);
      setSourceInfo({ filename: "Pasted Text", pages: null });
      if (onMultiSource) onMultiSource(pastedSource);
      setIsExpanded(false);
      setPasteMode(false);
    }
  };

  const clearSource = () => {
    setSourceText("");
    setSourceInfo(null);
    setSources([]);
    setIsExpanded(true);
    setPasteMode(false);
    if (onMultiSource) onMultiSource([]);
  };

  return (
    <div className="w-full max-w-3xl mx-auto" data-testid="source-input-container">
      {sources.length > 0 && !isExpanded && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl px-4 py-3 mb-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium">
              {sources.length === 1 ? "1 document loaded" : `${sources.length} documents loaded`}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 h-6 px-2"
              >
                <Plus className="w-3 h-3 mr-1" /> Add more
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSource}
                className="text-xs text-muted-foreground hover:text-red-400 h-6 px-2"
              >
                Clear all
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            {sources.map((s) => (
              <div key={s.filename} className="flex items-center justify-between bg-white/3 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-xs text-foreground truncate">{s.filename}</span>
                  {s.pages && (
                    <span className="text-[10px] text-muted-foreground shrink-0">{s.pages} pages</span>
                  )}
                  {s.images && s.images.length > 0 && (
                    <span className="text-[10px] text-indigo-400/70 shrink-0">
                      {s.images.length} images
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSource(s.filename)}
                  className="h-5 w-5 text-muted-foreground hover:text-red-400 shrink-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden mb-4"
          >
            {sources.length > 0 && (
              <div className="flex justify-end mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(false)}
                  className="text-xs text-muted-foreground"
                >
                  <ChevronUp className="w-3 h-3 mr-1" /> Collapse
                </Button>
              </div>
            )}

            {!pasteMode ? (
              <div className="space-y-4">
                <div
                  {...getRootProps()}
                  className={`upload-zone rounded-xl p-10 text-center cursor-pointer ${isDragActive ? "active" : ""}`}
                  data-testid="pdf-upload-zone"
                >
                  <input {...getInputProps()} data-testid="pdf-file-input" />
                  <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                  {isUploading ? (
                    <p className="text-sm text-muted-foreground loading-pulse">Extracting text and images from PDFs...</p>
                  ) : isDragActive ? (
                    <p className="text-sm text-indigo-400">Drop PDFs here</p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Drag & drop one or more PDFs, or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        Multiple PDFs supported — hold Ctrl to select multiple
                      </p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground uppercase tracking-widest">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <Button
                  variant="outline"
                  className="w-full h-11 border-white/10 hover:border-indigo-500/30 text-muted-foreground hover:text-foreground"
                  onClick={() => setPasteMode(true)}
                  data-testid="paste-text-btn"
                >
                  <Clipboard className="w-4 h-4 mr-2" /> Paste text directly
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Textarea
                  placeholder="Paste your text here..."
                  className="min-h-[180px] bg-[#0a0a0a] border-white/10 focus:border-indigo-500/40 resize-none text-sm"
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  data-testid="paste-text-area"
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setPasteMode(false); if (!sourceInfo) setSourceText(""); }}
                    className="text-muted-foreground"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handlePasteSubmit}
                    disabled={!sourceText.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Load Text
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}