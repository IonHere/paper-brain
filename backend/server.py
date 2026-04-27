from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import httpx
import pdfplumber
import base64
import io
import uuid
import re
from pathlib import Path
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ─────────────────────────────────────────────
# Supabase REST API (works on Vercel serverless)
# ─────────────────────────────────────────────
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SECRET_KEY', '')

def supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

async def sb_select(table: str, filters: dict = None, order: str = None, limit: int = None):
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=*"
    if filters:
        for k, v in filters.items():
            url += f"&{k}=eq.{v}"
    if order:
        url += f"&order={order}.desc"
    if limit:
        url += f"&limit={limit}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url, headers=supabase_headers())
        return r.json() if r.status_code == 200 else []

async def sb_insert(table: str, data: dict):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(url, headers=supabase_headers(), json=data)
        return r.json()

async def sb_update(table: str, match: dict, data: dict):
    url = f"{SUPABASE_URL}/rest/v1/{table}?"
    url += "&".join([f"{k}=eq.{v}" for k, v in match.items()])
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.patch(url, headers=supabase_headers(), json=data)
        return r.json()

async def sb_delete(table: str, match: dict):
    url = f"{SUPABASE_URL}/rest/v1/{table}?"
    url += "&".join([f"{k}=eq.{v}" for k, v in match.items()])
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.delete(url, headers=supabase_headers())
        return r.status_code

async def sb_upsert(table: str, data: dict, on_conflict: str):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**supabase_headers(), "Prefer": f"resolution=merge-duplicates,return=representation"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(url, headers=headers, json=data)
        return r.json()

# ─────────────────────────────────────────────
# Groq API
# ─────────────────────────────────────────────
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_MODEL = os.environ.get('HF_TEXT_MODEL', 'llama-3.1-8b-instant')
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# Gemini Vision API
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ─────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────
class ProcessRequest(BaseModel):
    texts: List[dict]
    mode: str
    query: Optional[str] = None
    question: Optional[str] = None
    answer: Optional[str] = None
    history: Optional[List[dict]] = None
    images: Optional[List[dict]] = None

class FeedbackRequest(BaseModel):
    result_id: str
    feedback: str
    comment: Optional[str] = None

class RegenerateRequest(BaseModel):
    texts: List[dict]
    mode: str
    previous_response: str
    feedback_comment: Optional[str] = None
    query: Optional[str] = None
    question: Optional[str] = None
    answer: Optional[str] = None
    images: Optional[List[dict]] = None

class SessionRequest(BaseModel):
    id: str
    label: str
    date: str
    full_text: Optional[str] = None
    filename: Optional[str] = None

# ─────────────────────────────────────────────
# AI model calls  (HuggingFace)
# ─────────────────────────────────────────────
async def call_text_model(prompt: str) -> str:
    """Call Groq API (fast, free, supports Llama & Mistral)"""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
        "temperature": 0.7
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(GROQ_API_URL, headers=headers, json=payload)
            if response.status_code == 200:
                data = response.json()
                return data["choices"][0]["message"]["content"]
            raise HTTPException(status_code=502, detail=f"Groq API error: {response.status_code} {response.text}")
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Groq model timed out")

async def analyze_image_with_vision_model(image_base64: str, page: int = 0) -> dict:
    """Analyze image using Gemini Vision - reads diagrams, charts, handwriting"""
    try:
        payload = {
            "contents": [{
                "parts": [
                    {"text": "Analyze this image from a PDF document. If it contains handwritten text, extract ALL the text exactly. If it contains a diagram, chart, or figure, describe it in detail including labels, relationships, and key concepts. If it contains printed text, extract it. Be thorough and specific."},
                    {"inline_data": {"mime_type": "image/png", "data": image_base64}}
                ]
            }],
            "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.1}
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                json=payload
            )
            if response.status_code == 200:
                data = response.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return {"page": page, "description": text, "type": "gemini_vision"}
            logging.error(f"Gemini Vision error: {response.status_code} {response.text}")
            return {"page": page, "description": "Image analysis failed", "type": "error"}
    except Exception as e:
        logging.error(f"Vision error: {e}")
        return {"page": page, "description": "Image analysis unavailable", "type": "error"}

# ─────────────────────────────────────────────
# Intent detection & prompt builder (unchanged)
# ─────────────────────────────────────────────
def detect_intent(user_input: str):
    text = user_input.lower().strip()
    if any(w in text for w in ["summarize", "summary", "sum up", "overview", "brief"]):
        return "summarize", None
    match = re.search(r'(\d+)\s*questions?', text)
    if match:
        return "question", int(match.group(1))
    if any(p in text for p in ["generate questions", "give questions", "list questions"]):
        return "question", 5
    if any(w in text for w in ["evaluate", "assess", "check", "grade", "score"]):
        return "evaluate", None
    return "answer", None

def build_prompt(mode, text, filename="", query=None, question=None, answer=None,
                 num_questions=5, history=None, image_descriptions=None):
    truncated = text[:4000]
    label = f" (from {filename})" if filename else ""

    history_context = ""
    if history:
        history_context = "\n\nPrevious conversation:\n"
        for h in history[-5:]:
            if h.get("inputQuery"):
                history_context += f"User: {h['inputQuery']}\n"
            if h.get("result"):
                history_context += f"Assistant: {h['result'][:300]}\n\n"

    image_context = ""
    if image_descriptions:
        image_context = "\n\nImages in document:\n"
        for i, desc in enumerate(image_descriptions[:5]):
            image_context += f"Image {i+1}: {desc}\n"

    if mode == "summarize":
        return f"""[INST] Summarize the following text clearly in bullet points. Focus only on key points.{history_context}{image_context}

Text{label}:
{truncated}

Summary: [/INST]"""

    elif mode == "question":
        return f"""[INST] Generate exactly {num_questions} questions based on this text. Output ONLY a numbered list.{history_context}{image_context}

Text{label}:
{truncated}

Questions: [/INST]"""

    elif mode == "answer":
        return f"""[INST] Answer this question based ONLY on the provided text. Be direct and concise.{history_context}{image_context}

Text{label}:
{truncated}

Question: {query}

Answer: [/INST]"""

    elif mode == "evaluate":
        return f"""[INST] Evaluate if this answer correctly addresses the question. Give a score 1-10 and explain.{history_context}{image_context}

Text{label}:
{truncated[:2000]}

Question: {question}
Answer: {answer}

Evaluation: [/INST]"""

    else:
        return f"""[INST] Answer this question based on the text.{history_context}{image_context}

Text{label}:
{truncated}

Question: {query}

Answer: [/INST]"""

def are_texts_related(texts: List[dict]) -> bool:
    if len(texts) < 2:
        return False
    word_sets = []
    for t in texts:
        words = set(re.findall(r'\b\w{5,}\b', t["text"].lower()[:2000]))
        word_sets.append(words)
    overlap = word_sets[0]
    for s in word_sets[1:]:
        overlap = overlap & s
    return len(overlap) > 20

# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────
@api_router.get("/")
async def root():
    return {"message": "PaperBrain API - HuggingFace + Supabase"}

@api_router.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = await file.read()
    text = ""
    pages_count = 0
    images = []

    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages_count = len(pdf.pages)
            for page_num, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
                for img_obj in page.images:
                    try:
                        x0, top, x1, bottom = img_obj["x0"], img_obj["top"], img_obj["x1"], img_obj["bottom"]
                        width, height = x1 - x0, bottom - top
                        if width < 100 or height < 100:
                            continue
                        aspect_ratio = width / height if height > 0 else 0
                        if aspect_ratio > 4 or aspect_ratio < 0.2:
                            continue
                        cropped = page.within_bbox((x0, top, x1, bottom)).to_image(resolution=150)
                        img_buffer = io.BytesIO()
                        cropped.save(img_buffer, format="PNG")
                        img_buffer.seek(0)
                        img_base64 = base64.b64encode(img_buffer.read()).decode("utf-8")
                        images.append({"page": page_num + 1, "data": img_base64,
                                       "width": round(width), "height": round(height)})
                    except Exception:
                        continue
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse PDF")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    return {"text": text.strip(), "pages": pages_count, "filename": file.filename, "images": images[:20]}

@api_router.post("/process")
async def process_text(request: ProcessRequest):
    if not request.texts:
        raise HTTPException(status_code=400, detail="No text provided")

    mode = request.mode
    num_questions = 5
    results = []
    image_descriptions = []

    if request.query:
        detected_mode, detected_num = detect_intent(request.query)
        if request.mode == "auto":
            mode = detected_mode
        if detected_num:
            num_questions = detected_num

    if request.images:
        for img in request.images[:5]:
            try:
                result = await analyze_image_with_vision_model(img["data"], img.get("page", 0))
                if result and result.get("description"):
                    image_descriptions.append(result["description"])
            except Exception as e:
                logging.error(f"Image error: {e}")

    if len(request.texts) == 1:
        t = request.texts[0]
        prompt = build_prompt(mode, t["text"], t.get("filename", ""), request.query,
                              request.question, request.answer, num_questions,
                              request.history, image_descriptions)
        result_text = await call_text_model(prompt)
        results.append({"filename": t.get("filename", "Document"), "result": result_text})
    else:
        if mode in ["summarize", "question"]:
            for t in request.texts:
                prompt = build_prompt(mode, t["text"], t.get("filename", ""), request.query,
                                      request.question, request.answer, num_questions,
                                      request.history, image_descriptions)
                result_text = await call_text_model(prompt)
                results.append({"filename": t.get("filename", "Document"), "result": result_text})
            if mode == "summarize" and are_texts_related(request.texts):
                combined_text = "\n\n".join([f"{t.get('filename','Doc')}: {t['text'][:1500]}" for t in request.texts])
                prompt = build_prompt("summarize", combined_text, "multiple", None, None, None, 5,
                                      request.history, image_descriptions)
                combined_result = await call_text_model(prompt)
                results.append({"filename": "Combined Summary", "result": combined_result, "is_combined": True})
        else:
            combined_text = "\n\n".join([f"From {t.get('filename','Doc')}: {t['text'][:2000]}" for t in request.texts])
            prompt = build_prompt(mode, combined_text, "all", request.query, request.question,
                                  request.answer, num_questions, request.history, image_descriptions)
            result_text = await call_text_model(prompt)
            results.append({"filename": "All Documents", "result": result_text})

    # Save to Supabase history table
    doc_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    source_preview = request.texts[0]["text"][:200] + "..."

    await sb_insert("history", {
        "id": doc_id, "mode": mode, "result": str(results),
        "timestamp": timestamp, "source_preview": source_preview,
        "full_text": request.texts[0]["text"][:10000],
        "filename": request.texts[0].get("filename", ""),
        "query": request.query, "question": request.question,
        "answer": request.answer, "image_count": len(image_descriptions)
    })

    return {"id": doc_id, "mode": mode, "results": results,
            "timestamp": timestamp, "source_preview": source_preview,
            "images_processed": len(image_descriptions)}

@api_router.post("/feedback")
async def save_feedback(request: FeedbackRequest):
    await sb_update("history", {"id": request.result_id},
                    {"feedback": request.feedback, "feedback_comment": request.comment})
    return {"message": "Feedback saved"}

@api_router.get("/preferences")
async def get_preferences():
    return {}

@api_router.post("/regenerate")
async def regenerate_response(request: RegenerateRequest):
    mode = request.mode
    num_questions = 5

    if request.query:
        detected_mode, detected_num = detect_intent(request.query)
        if request.mode == "auto":
            mode = detected_mode
        if detected_num:
            num_questions = detected_num

    truncated = request.texts[0]["text"][:4000] if request.texts else ""
    image_descriptions = []

    if request.images:
        for img in request.images[:5]:
            try:
                result = await analyze_image_with_vision_model(img["data"], img.get("page", 0))
                if result and result.get("description"):
                    image_descriptions.append(result["description"])
            except Exception as e:
                logging.error(f"Image error: {e}")

    feedback_instruction = ""
    if request.feedback_comment:
        feedback_instruction = f"\nUser feedback: {request.feedback_comment}\nFollow this instruction strictly."

    prompt = f"""[INST] {feedback_instruction}

Improve this response based on the feedback and text:

Text: {truncated}

Original response: {request.previous_response}

Question: {request.query}

Improved response: [/INST]"""

    result = await call_text_model(prompt)

    doc_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()

    await sb_insert("history", {
        "id": doc_id, "mode": mode, "result": result,
        "timestamp": timestamp, "source_preview": truncated[:200],
        "full_text": truncated,
        "filename": request.texts[0].get("filename", "") if request.texts else "",
        "query": request.query, "is_regenerated": True
    })

    return {"id": doc_id, "mode": mode, "result": result,
            "timestamp": timestamp, "is_regenerated": True}

@api_router.get("/history")
async def get_history():
    rows = await sb_select("history", order="timestamp", limit=50)
    return rows if isinstance(rows, list) else []

@api_router.delete("/history/{item_id}")
async def delete_history_item(item_id: str):
    await sb_delete("history", {"id": item_id})
    return {"message": "Item deleted"}

@api_router.delete("/history")
async def clear_history():
    # Delete all — Supabase requires a filter, use neq on a field that always has value
    await sb_delete("history", {"id": "neq.null"})
    return {"message": "History cleared"}

@api_router.post("/sessions")
async def save_session(request: SessionRequest):
    await sb_upsert("sessions", {
        "session_id": request.id, "label": request.label,
        "date": request.date, "full_text": request.full_text,
        "filename": request.filename
    }, on_conflict="session_id")
    return {"message": "Session saved"}

@api_router.get("/sessions")
async def get_sessions():
    rows = await sb_select("sessions", order="date", limit=100)
    return rows if isinstance(rows, list) else []

@api_router.get("/sessions/{session_id}")
async def get_session_details(session_id: str):
    rows = await sb_select("sessions", filters={"session_id": session_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found")
    return rows[0]

@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    await sb_delete("sessions", {"session_id": session_id})
    return {"message": "Session deleted"}

# ─────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)