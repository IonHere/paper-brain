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
import asyncpg

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ─────────────────────────────────────────────
# Supabase / Postgres connection
# ─────────────────────────────────────────────
DATABASE_URL = os.environ.get('DATABASE_URL')  # postgresql://postgres.xxx:password@aws-1-ap-south-1.pooler.supabase.com:5432/postgres

# ─────────────────────────────────────────────
# Groq API (replaces HuggingFace)
# ─────────────────────────────────────────────
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_MODEL = os.environ.get('HF_TEXT_MODEL', 'llama-3.1-8b-instant')
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# HuggingFace still used for vision model
HF_TOKEN = os.environ.get('HF_TOKEN', '')
HF_VISION_MODEL = os.environ.get('HF_VISION_MODEL', 'llava-hf/llava-1.5-7b-hf')
HF_API_BASE = "https://api-inference.huggingface.co/models"

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ─────────────────────────────────────────────
# DB helpers  (asyncpg – no ORM needed)
# ─────────────────────────────────────────────
async def get_db():
    return await asyncpg.connect(DATABASE_URL)

async def db_execute(query: str, *args):
    conn = await get_db()
    try:
        await conn.execute(query, *args)
    finally:
        await conn.close()

async def db_fetch(query: str, *args):
    conn = await get_db()
    try:
        return await conn.fetch(query, *args)
    finally:
        await conn.close()

async def db_fetchrow(query: str, *args):
    conn = await get_db()
    try:
        return await conn.fetchrow(query, *args)
    finally:
        await conn.close()

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

async def analyze_image_with_vision_model(image_base64: str) -> str:
    """Analyze image using HuggingFace vision model"""
    url = f"{HF_API_BASE}/{HF_VISION_MODEL}"
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}
    try:
        image_bytes = base64.b64decode(image_base64)
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                url,
                headers={**headers, "Content-Type": "image/png"},
                content=image_bytes
            )
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    return data[0].get("generated_text", "Image analyzed")
                return str(data)
            return "Image analysis unavailable"
    except Exception as e:
        logging.error(f"Vision model error: {e}")
        return "Image analysis failed"

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
                desc = await analyze_image_with_vision_model(img["data"])
                if desc:
                    image_descriptions.append(desc)
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

    await db_execute(
        """INSERT INTO history (id, mode, result, timestamp, source_preview, full_text, filename, query, question, answer, image_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
        doc_id, mode, str(results), timestamp, source_preview,
        request.texts[0]["text"][:10000],
        request.texts[0].get("filename", ""),
        request.query, request.question, request.answer, len(image_descriptions)
    )

    return {"id": doc_id, "mode": mode, "results": results,
            "timestamp": timestamp, "source_preview": source_preview,
            "images_processed": len(image_descriptions)}

@api_router.post("/feedback")
async def save_feedback(request: FeedbackRequest):
    await db_execute(
        "UPDATE history SET feedback=$1, feedback_comment=$2 WHERE id=$3",
        request.feedback, request.comment, request.result_id
    )
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
                desc = await analyze_image_with_vision_model(img["data"])
                if desc:
                    image_descriptions.append(desc)
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

    await db_execute(
        """INSERT INTO history (id, mode, result, timestamp, source_preview, full_text, filename, query, is_regenerated)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
        doc_id, mode, result, timestamp, truncated[:200], truncated,
        request.texts[0].get("filename", "") if request.texts else "",
        request.query, True
    )

    return {"id": doc_id, "mode": mode, "result": result,
            "timestamp": timestamp, "is_regenerated": True}

@api_router.get("/history")
async def get_history():
    rows = await db_fetch("SELECT * FROM history ORDER BY timestamp DESC LIMIT 50")
    return [dict(r) for r in rows]

@api_router.delete("/history/{item_id}")
async def delete_history_item(item_id: str):
    await db_execute("DELETE FROM history WHERE id=$1", item_id)
    return {"message": "Item deleted"}

@api_router.delete("/history")
async def clear_history():
    await db_execute("DELETE FROM history")
    return {"message": "History cleared"}

@api_router.post("/sessions")
async def save_session(request: SessionRequest):
    await db_execute(
        """INSERT INTO sessions (session_id, label, date, full_text, filename)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (session_id) DO UPDATE
           SET label=$2, date=$3, full_text=$4, filename=$5""",
        request.id, request.label, request.date, request.full_text, request.filename
    )
    return {"message": "Session saved"}

@api_router.get("/sessions")
async def get_sessions():
    rows = await db_fetch("SELECT * FROM sessions ORDER BY date DESC LIMIT 100")
    return [dict(r) for r in rows]

@api_router.get("/sessions/{session_id}")
async def get_session_details(session_id: str):
    row = await db_fetchrow("SELECT * FROM sessions WHERE session_id=$1", session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return dict(row)

@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    await db_execute("DELETE FROM sessions WHERE session_id=$1", session_id)
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