from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Header
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
# Supabase REST API
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

async def sb_select(table, filters=None, order=None, limit=None):
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

async def sb_insert(table, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(url, headers=supabase_headers(), json=data)
        return r.json()

async def sb_update(table, match, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}?"
    url += "&".join([f"{k}=eq.{v}" for k, v in match.items()])
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.patch(url, headers=supabase_headers(), json=data)
        return r.json()

async def sb_delete(table, match):
    url = f"{SUPABASE_URL}/rest/v1/{table}?"
    url += "&".join([f"{k}=eq.{v}" for k, v in match.items()])
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.delete(url, headers=supabase_headers())
        return r.status_code

async def sb_upsert(table, data, on_conflict):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**supabase_headers(), "Prefer": "resolution=merge-duplicates,return=representation"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(url, headers=headers, json=data)
        return r.json()

# ─────────────────────────────────────────────
# Helper: get user_id from request header
# ─────────────────────────────────────────────
async def get_user_id(x_user_id: Optional[str] = Header(None, alias="X-User-Id")):
    """Returns user_id if provided, else None (for guests)"""
    return x_user_id

# ─────────────────────────────────────────────
# MAIN MODEL — Groq (Mistral/LLaMA) for text
# ─────────────────────────────────────────────
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_MODEL = os.environ.get('HF_TEXT_MODEL', 'llama-3.1-8b-instant')
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# ─────────────────────────────────────────────
# SUPPORT MODEL — Gemini Vision for images
# ─────────────────────────────────────────────
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
    session_id: Optional[str] = None
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
# MAIN MODEL — Groq text generation
# ─────────────────────────────────────────────
async def call_text_model(prompt: str, retries: int = 3) -> str:
    """Main text model — generates all text responses with retry on rate limit"""
    import asyncio
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 2048,
        "temperature": 0.7
    }
    for attempt in range(retries):
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(GROQ_API_URL, headers=headers, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    return data["choices"][0]["message"]["content"]
                elif response.status_code == 429:
                    wait_time = (attempt + 1) * 15  # 15s, 30s, 45s
                    logging.warning(f"Groq rate limit hit, retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                raise HTTPException(status_code=502, detail=f"Groq API error: {response.status_code}")
            except httpx.TimeoutException:
                raise HTTPException(status_code=504, detail="Text model timed out")
    raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait a moment and try again.")

# ─────────────────────────────────────────────
# SUPPORT MODEL — Gemini Vision
# ─────────────────────────────────────────────
async def analyze_image_with_vision_model(image_base64: str, page: int = 0) -> dict:
    """Support model — reads images, diagrams, handwriting"""
    try:
        payload = {
            "contents": [{
                "parts": [
                    {"text": "Analyze this image from a PDF. If handwritten: extract ALL text exactly. If diagram/chart/figure: describe in detail with labels, relationships, key concepts, and topic name. If printed text: extract it. Be thorough and specific about the topic this image covers."},
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
            return {"page": page, "description": "Image analysis failed", "type": "error"}
    except Exception as e:
        logging.error(f"Vision error: {e}")
        return {"page": page, "description": "Image analysis unavailable", "type": "error"}

async def extract_handwritten_text(image_base64: str) -> str:
    """Support model — OCR for handwritten/scanned PDFs"""
    try:
        payload = {
            "contents": [{
                "parts": [
                    {"text": "This is a scanned handwritten document. Extract ALL handwritten text exactly as written, preserving structure, headings, bullet points, and paragraphs. Output only the extracted text."},
                    {"inline_data": {"mime_type": "image/png", "data": image_base64}}
                ]
            }],
            "generationConfig": {"maxOutputTokens": 2048, "temperature": 0.0}
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                json=payload
            )
            if response.status_code == 200:
                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
            return ""
    except Exception as e:
        logging.error(f"Handwriting OCR error: {e}")
        return ""

# ─────────────────────────────────────────────
# SUPPORT MODEL — Section-image matching logic
# ─────────────────────────────────────────────
def extract_keywords(text: str) -> set:
    return set(re.findall(r'\b\w{5,}\b', text.lower()))

def find_best_image_for_section(section_text: str, analyzed_images: list, used_images: set):
    """Find most relevant unused image for a section. Never reuses same image."""
    if not analyzed_images:
        return None
    section_keywords = extract_keywords(section_text)
    if not section_keywords:
        return None

    best_image = None
    best_score = 0

    for i, img in enumerate(analyzed_images):
        if i in used_images:
            continue
        desc = img.get("description", "")
        if not desc or img.get("type") == "error":
            continue
        desc_keywords = extract_keywords(desc)
        overlap = len(section_keywords & desc_keywords)
        score = overlap / max(len(desc_keywords), 1)
        if overlap >= 2 and score > 0.04 and score > best_score:
            best_score = score
            best_image = (i, img)

    if best_image:
        used_images.add(best_image[0])
        img_data = best_image[1]
        return {"page": img_data["page"], "data": img_data["data"]}
    return None

def build_sections_with_images(text: str, analyzed_images: list, mode: str) -> list:
    """
    SUPPORT MODEL logic:
    Splits main model's text into sections and matches each to a relevant image.
    Never modifies the text — only adds image references.
    Adaptive to all modes: answer, summarize, question, evaluate.
    """
    if not analyzed_images:
        return [{"heading": "", "text": text, "image": None}]

    sections = []
    used_images = set()

    parts = re.split(r'(?=^##\s)', text, flags=re.MULTILINE)

    if len(parts) > 1:
        for part in parts:
            part = part.strip()
            if not part:
                continue
            lines = part.split('\n', 1)
            heading = lines[0].lstrip('#').strip() if lines[0].startswith('#') else ""
            body = lines[1].strip() if len(lines) > 1 else lines[0].strip()
            search_text = f"{heading} {body}"
            image = find_best_image_for_section(search_text, analyzed_images, used_images)
            sections.append({"heading": heading, "text": body, "image": image})
        return sections

    if mode == "question":
        items = re.split(r'(?=^\d+[\.\)]\s)', text, flags=re.MULTILINE)
        if len(items) > 1:
            for item in items:
                item = item.strip()
                if not item:
                    continue
                image = find_best_image_for_section(item, analyzed_images, used_images)
                sections.append({"heading": "", "text": item, "image": image})
            return sections

    image = find_best_image_for_section(text, analyzed_images, used_images)
    return [{"heading": "", "text": text, "image": image}]

# ─────────────────────────────────────────────
# Intent detection & prompt builder
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
        image_context = "\n\nImages/diagrams in document:\n"
        for i, desc in enumerate(image_descriptions[:5]):
            image_context += f"Image {i+1}: {desc[:200]}\n"

    if mode == "summarize":
        return f"""[INST] Summarize the following text using clear ## headings for each major topic, with bullet points under each heading. Cover ALL key topics thoroughly.{history_context}{image_context}

Text{label}:
{truncated}

Detailed Summary: [/INST]"""

    elif mode == "question":
        return f"""[INST] Generate exactly {num_questions} questions based on this text. Output ONLY a numbered list. Each question on its own line.{history_context}{image_context}

Text{label}:
{truncated}

Questions: [/INST]"""

    elif mode == "answer":
        return f"""[INST] Answer the following question in detail. If the question covers multiple topics, use ## headings for each sub-topic. Use bullet points where appropriate. Base your answer ONLY on the provided text.{history_context}{image_context}

Text{label}:
{truncated}

Question: {query}

Detailed Answer: [/INST]"""

    elif mode == "evaluate":
        return f"""[INST] Evaluate this answer using these ## headings exactly: ## Score, ## Correct Points, ## Missing Points, ## How to Improve. Be specific and detailed under each heading.{history_context}{image_context}

Text{label}:
{truncated[:2000]}

Question: {question}
Answer: {answer}

Evaluation: [/INST]"""

    else:
        return f"""[INST] Answer this question in detail. If covering multiple topics, use ## headings for each sub-topic.{history_context}{image_context}

Text{label}:
{truncated}

Question: {query}

Detailed Answer: [/INST]"""

def are_texts_related(texts):
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
    return {"message": "PaperBrain API — Groq (main) + Gemini Vision (support)"}

@api_router.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    filename = file.filename or ""
    content_type = file.content_type or ""
    is_pdf_by_name = filename.lower().endswith('.pdf')
    is_pdf_by_type = content_type in [
        "application/pdf",
        "application/octet-stream",
        "binary/octet-stream",
        "application/x-pdf",
    ]
    if not is_pdf_by_name and not is_pdf_by_type:
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    content = await file.read()
    if not content.startswith(b'%PDF'):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid PDF")

    text = ""
    pages_count = 0
    images = []
    is_scanned = False
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages_count = len(pdf.pages)
            total_text = ""
            for page_num, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                if page_text:
                    total_text += page_text
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
            if len(total_text.strip()) < 100 and len(images) > 0:
                is_scanned = True
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse PDF")

    if is_scanned and images:
        extracted_texts = []
        for img in images[:10]:
            extracted = await extract_handwritten_text(img["data"])
            if extracted:
                extracted_texts.append(extracted)
        if extracted_texts:
            text = "\n\n".join(extracted_texts)

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    return {
        "text": text.strip(),
        "pages": pages_count,
        "filename": file.filename,
        "images": images[:20],
        "is_scanned": is_scanned
    }

@api_router.post("/process")
async def process_text(request: ProcessRequest, user_id: Optional[str] = Header(None, alias="X-User-Id")):
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

    analyzed_images = []
    if request.images:
        for img in request.images[:8]:
            try:
                result = await analyze_image_with_vision_model(img["data"], img.get("page", 0))
                if result and result.get("description"):
                    image_descriptions.append(result["description"])
                    analyzed_images.append({
                        "page": img.get("page", 0),
                        "data": img["data"],
                        "description": result["description"]
                    })
            except Exception as e:
                logging.error(f"Image analysis error: {e}")

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

    sectioned_results = []
    for r in results:
        sections = build_sections_with_images(r["result"], analyzed_images, mode)
        sectioned_results.append({
            "filename": r.get("filename", "Document"),
            "result": r["result"],
            "is_combined": r.get("is_combined", False),
            "sections": sections
        })

    doc_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    source_preview = request.texts[0]["text"][:200] + "..."

    await sb_insert("history", {
        "id": doc_id,
        "mode": mode,
        "result": str(results),
        "timestamp": timestamp,
        "source_preview": source_preview,
        "full_text": request.texts[0]["text"][:10000],
        "filename": request.texts[0].get("filename", ""),
        "query": request.query,
        "question": request.question,
        "answer": request.answer,
        "image_count": len(image_descriptions),
        "session_id": request.session_id or doc_id,
        "user_id": user_id   # <── attach user_id if provided
    })

    return {
        "id": doc_id,
        "mode": mode,
        "results": sectioned_results,
        "timestamp": timestamp,
        "source_preview": source_preview,
        "images_processed": len(analyzed_images),
        "analyzed_images": analyzed_images
    }

@api_router.post("/feedback")
async def save_feedback(request: FeedbackRequest):
    await sb_update("history", {"id": request.result_id},
                    {"feedback": request.feedback, "feedback_comment": request.comment})
    return {"message": "Feedback saved"}

@api_router.get("/preferences")
async def get_preferences():
    return {}

@api_router.post("/regenerate")
async def regenerate_response(
    request: RegenerateRequest,
    user_id: Optional[str] = Header(None, alias="X-User-Id")
):
    mode = request.mode
    if request.query:
        detected_mode, _ = detect_intent(request.query)
        if request.mode == "auto":
            mode = detected_mode

    truncated = request.texts[0]["text"][:4000] if request.texts else ""

    analyzed_images = []
    if request.images:
        for img in request.images[:8]:
            try:
                result = await analyze_image_with_vision_model(img["data"], img.get("page", 0))
                if result and result.get("description"):
                    analyzed_images.append({
                        "page": img.get("page", 0),
                        "data": img["data"],
                        "description": result["description"]
                    })
            except Exception as e:
                logging.error(f"Image error: {e}")

    feedback_instruction = ""
    if request.feedback_comment:
        feedback_instruction = f"\nUser feedback: {request.feedback_comment}\nFollow this strictly.\n"

    prompt = f"""[INST] {feedback_instruction}
Improve this response based on feedback. Use ## headings for sections. Do NOT change factual content.

Text: {truncated}
Original response: {request.previous_response}
Question: {request.query}

Improved response: [/INST]"""

    result_text = await call_text_model(prompt)
    sections = build_sections_with_images(result_text, analyzed_images, mode)

    doc_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()

    await sb_insert("history", {
        "id": doc_id,
        "mode": mode,
        "result": result_text,
        "timestamp": timestamp,
        "source_preview": truncated[:200],
        "full_text": truncated,
        "filename": request.texts[0].get("filename", "") if request.texts else "",
        "query": request.query,
        "is_regenerated": True,
        "user_id": user_id   # <── attach user_id
    })

    return {
        "id": doc_id,
        "mode": mode,
        "result": result_text,
        "sections": sections,
        "analyzed_images": analyzed_images,
        "timestamp": timestamp,
        "is_regenerated": True
    }

@api_router.get("/history")
async def get_history(user_id: Optional[str] = Header(None, alias="X-User-Id")):
    rows = await sb_select("history", order="timestamp", limit=50)
    if not rows:
        return []
    # Filter by user_id if header is present, else return all (guest fallback, but typically guests won't have X-User-Id)
    if user_id:
        rows = [r for r in rows if r.get("user_id") == user_id]
    else:
        # Guest: return only records without user_id (NULL/None)
        rows = [r for r in rows if not r.get("user_id")]
    return rows

@api_router.delete("/history/{item_id}")
async def delete_history_item(item_id: str):
    await sb_delete("history", {"id": item_id})
    return {"message": "Item deleted"}

@api_router.delete("/history")
async def clear_history():
    await sb_delete("history", {"id": "neq.null"})
    return {"message": "History cleared"}

@api_router.post("/sessions")
async def save_session(
    request: SessionRequest,
    user_id: Optional[str] = Header(None, alias="X-User-Id")
):
    await sb_upsert("sessions", {
        "session_id": request.id,
        "label": request.label,
        "date": request.date,
        "full_text": request.full_text,
        "filename": request.filename,
        "user_id": user_id   # <── attach user_id
    }, on_conflict="session_id")
    return {"message": "Session saved"}

@api_router.get("/sessions")
async def get_sessions(user_id: Optional[str] = Header(None, alias="X-User-Id")):
    rows = await sb_select("sessions", order="date", limit=100)
    if not rows:
        return []
    if user_id:
        rows = [r for r in rows if r.get("user_id") == user_id]
    else:
        rows = [r for r in rows if not r.get("user_id")]
    return rows

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

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)