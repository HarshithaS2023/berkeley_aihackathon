import json
import os
import re
import uuid as _uuid
from contextlib import asynccontextmanager
from typing import Literal

import anthropic
import httpx
from anthropic import APIError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

# override=True ensures values in .env win over any shell variables
# (e.g. a local Ollama setup exporting ANTHROPIC_MODEL / ANTHROPIC_BASE_URL).
load_dotenv(override=True)

# Force the Anthropic cloud API. We pass api_key and base_url explicitly so a
# local proxy configured via ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN (Ollama)
# cannot redirect these calls.
API_KEY = os.environ.get("ANTHROPIC_API_KEY")
BASE_URL = os.getenv("CLAUDE_BASE_URL", "https://api.anthropic.com")
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
DEEPGRAM_SPEAK_MODEL = os.getenv("DEEPGRAM_SPEAK_MODEL", "aura-2-asteria-en")

client = anthropic.AsyncAnthropic(api_key=API_KEY, base_url=BASE_URL)
deepgram_http_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global deepgram_http_client
    deepgram_http_client = httpx.AsyncClient(
        timeout=30.0,
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
    )
    # Warm up the connection/model so the first real request is fast.
    try:
        await client.messages.create(
            model=MODEL,
            max_tokens=5,
            messages=[{"role": "user", "content": "ping"}],
        )
    except Exception:
        pass
    yield
    await deepgram_http_client.aclose()
    deepgram_http_client = None


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_json_object(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in Claude response")
    return json.loads(text[start : end + 1])


def parse_json_array(text: str) -> list:
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("No JSON array found in Claude response")
    return json.loads(text[start : end + 1])


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": MODEL,
        "base_url": BASE_URL,
        "deepgramConfigured": bool(DEEPGRAM_API_KEY),
    }


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)


@app.post("/speak")
async def speak(body: SpeakRequest) -> Response:
    if not DEEPGRAM_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Deepgram API key not configured on the server.",
        )

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")

    try:
        http_client = deepgram_http_client or httpx.AsyncClient(timeout=30.0)
        response = await http_client.post(
            "https://api.deepgram.com/v1/speak",
            params={"model": DEEPGRAM_SPEAK_MODEL},
            headers={
                "Authorization": f"Token {DEEPGRAM_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"text": text},
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Deepgram text-to-speech failed: {exc}",
        ) from exc

    return Response(content=response.content, media_type="audio/mpeg")


# ── Analyze Source ────────────────────────────────────────────────────────────

class FileItem(BaseModel):
    name: str
    base64: str
    mimeType: str


class AnalyzeSourceRequest(BaseModel):
    files: list[FileItem] = Field(default_factory=list)
    instructions: str = ""


@app.post("/analyze-source")
async def analyze_source(body: AnalyzeSourceRequest):
    content: list = []
    for f in body.files:
        if f.mimeType == "application/pdf":
            content.append({
                "type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": f.base64},
            })
        elif f.mimeType.startswith("image/"):
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": f.mimeType, "data": f.base64},
            })

    instructions = body.instructions.strip()
    if not content and not instructions:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one study file or quiz instructions.",
        )

    content.append({
        "type": "text",
        "text": (
            "Analyze the provided study material and/or quiz instructions. "
            "Use the instructions as the primary source when no file is attached.\n"
            f"User quiz instructions: {instructions or 'None provided'}\n\n"
            "Respond ONLY with valid JSON, no other text:\n"
            '{"topics": ["3-5 main topic names"], '
            '"concepts": ["5-10 key concepts, terms, or formulas"], '
            '"styleNotes": "one sentence describing the requested question content and style"}'
        ),
    })

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=500,
            messages=[{"role": "user", "content": content}],
        )
        return parse_json_object(response.content[0].text)
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc


# ── Generate Questions (batch) ────────────────────────────────────────────────

class BatchQuestionRequest(BaseModel):
    topics: list[str]
    concepts: list[str]
    style_notes: str = ""
    difficulty: int = 3  # 1–5
    problem_type: str = "word_problem"
    weak_areas: list[str] = Field(default_factory=list)
    previous_questions: list[str] = Field(default_factory=list)
    count: int = 5


_DIFFICULTY_LABEL = {1: "very easy", 2: "easy", 3: "medium", 4: "hard", 5: "very hard"}


@app.post("/generate-questions")
async def generate_questions_batch(body: BatchQuestionRequest):
    difficulty_label = _DIFFICULTY_LABEL.get(body.difficulty, "medium")
    avoid = json.dumps(body.previous_questions[:10]) if body.previous_questions else "none"

    prompt = (
        f"Generate exactly {body.count} distinct quiz questions for a student.\n\n"
        f"Topics: {', '.join(body.topics) or 'general'}\n"
        f"Key concepts: {', '.join(body.concepts) or 'as appropriate'}\n"
        f"Style notes: {body.style_notes or 'standard questions'}\n"
        f"Difficulty: {difficulty_label}\n"
        f"Problem type: {body.problem_type.replace('_', ' ')}\n"
        f"Weak areas to reinforce: {', '.join(body.weak_areas) if body.weak_areas else 'none yet'}\n"
        f"Do NOT repeat these already-asked questions: {avoid}\n\n"
        f"Return ONLY a valid JSON array with exactly {body.count} objects, no other text:\n"
        '[{"question":"...","hints":["hint that does not give away the answer"],"answer":"...","solution":"step-by-step explanation","concepts":["concept1"]}]'
    )

    # Scale tokens with how many questions we ask for instead of a flat large cap.
    max_tokens = min(3000, 500 + 400 * max(1, body.count))

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        items = parse_json_array(response.content[0].text)
        return [
            {
                "id": str(_uuid.uuid4()),
                "question": item["question"],
                "hints": item.get("hints", []),
                "answer": item["answer"],
                "solution": item.get("solution", ""),
                "difficulty": body.difficulty,
                "concepts": item.get("concepts", body.concepts[:2]),
            }
            for item in items
        ]
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc


# ── Analyze Work (single collapsed call) ──────────────────────────────────────

class WorkSubmission(BaseModel):
    image_base64: str | None = None
    work_text: str | None = None
    question: str
    correct_answer: str
    expected_solution: str = ""
    prior_errors: list[str] = Field(default_factory=list)


def parse_numeric_answer(value: str | None) -> float | None:
    if not value:
        return None

    matches = re.findall(r"-?\$?\s*\d[\d,]*(?:\.\d+)?", value)
    if not matches:
        return None

    try:
        return float(matches[-1].replace("$", "").replace(",", "").replace(" ", ""))
    except ValueError:
        return None


def format_number(value: float) -> str:
    return str(int(value)) if value.is_integer() else f"{value:g}"


@app.post("/analyze-work")
async def analyze_work(body: WorkSubmission):
    if not body.work_text and not body.image_base64:
        raise HTTPException(status_code=400, detail="Provide image_base64 or work_text.")

    instructions = (
        "You are a warm, precise math tutor. Evaluate the student's work in ONE pass.\n\n"
        f"Question: {body.question}\n"
        f"Correct answer: {body.correct_answer}\n"
        f"Expected solution: {body.expected_solution or 'Not provided'}\n"
        f"Student's typed final answer: {body.work_text or 'Not provided'}\n"
        f"Prior errors this session: {json.dumps(body.prior_errors)}\n\n"
        "Treat the typed final answer as authoritative when provided. Use the image "
        "to inspect intermediate work. Identify the first visible step that diverges "
        "from the expected solution. Never invent a submitted answer or claim a "
        "numerical difference; the server calculates numeric differences. If the "
        "work is unreadable or no exact incorrect step is visible, say so plainly.\n\n"
        "Respond ONLY with valid JSON, no other text:\n"
        '{"correct": true/false, '
        '"submitted_answer": "typed answer, or final answer read from image", '
        '"first_incorrect_step": "first incorrect step, or empty string", '
        '"is_repeated": true/false, '
        '"gap": "one sentence on the underlying concept gap", '
        '"feedback": "warm, specific feedback without unsupported arithmetic claims"}'
    )

    if body.image_base64:
        user_content: list = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": body.image_base64,
                },
            },
            {"type": "text", "text": instructions},
        ]
    else:
        user_content = instructions

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=600,
            messages=[{"role": "user", "content": user_content}],
        )
        data = parse_json_object(response.content[0].text)
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc

    is_correct = bool(data.get("correct", False))
    typed_answer = body.work_text.strip() if body.work_text else None
    submitted_answer = typed_answer or str(data.get("submitted_answer", "")).strip()
    submitted_number = parse_numeric_answer(submitted_answer)
    expected_number = parse_numeric_answer(body.correct_answer)
    numerical_difference = (
        abs(expected_number - submitted_number)
        if submitted_number is not None and expected_number is not None
        else None
    )

    if typed_answer and submitted_number is not None and expected_number is not None:
        is_correct = abs(expected_number - submitted_number) < 1e-9

    feedback_text = str(data.get("feedback", "")).strip()
    if numerical_difference is not None and not is_correct:
        accurate_difference = format_number(numerical_difference)
        feedback_text = re.sub(
            r"off by\s+\$?\s*-?\d[\d,]*(?:\.\d+)?",
            f"off by ${accurate_difference}",
            feedback_text,
            flags=re.IGNORECASE,
        )

    return {
        "correct": is_correct,
        "error_found": not is_correct,
        "submitted_answer": submitted_answer,
        "expected_answer": body.correct_answer,
        "numerical_difference": numerical_difference,
        "first_incorrect_step": data.get("first_incorrect_step", ""),
        "is_repeated_pattern": bool(data.get("is_repeated", False)),
        "conceptual_gap": data.get("gap", ""),
        "feedback_text": feedback_text,
    }


# ── Legacy: single question endpoint ──────────────────────────────────────────

class QuestionRequest(BaseModel):
    topic: str
    difficulty: Literal["easy", "medium", "hard"]
    material_context: str | None = None
    prior_questions: list[str] = Field(default_factory=list)


class QuestionResponse(BaseModel):
    topic: str
    difficulty: str
    question_type: str
    question_text: str
    hint: str
    correct_answer: str
    solution_steps: list[str]


@app.post("/generate-question")
async def generate_question(body: QuestionRequest):
    difficulty_guidance = {
        "easy": "Use direct recall or a one-step application. Keep numbers simple.",
        "medium": "Use a two- to three-step problem that requires applying the concept.",
        "hard": "Use a multi-step problem that combines ideas or asks for deeper reasoning.",
    }

    prompt = f"""
Create one STEM quiz question for a student.

Topic: {body.topic}
Difficulty: {body.difficulty}
Guidance: {difficulty_guidance[body.difficulty]}
Material context: {body.material_context or "None provided."}
Prior questions to avoid: {json.dumps(body.prior_questions)}

Return ONLY valid JSON:
{{
  "topic": "{body.topic}",
  "difficulty": "{body.difficulty}",
  "question_type": "conceptual multiple choice | short-answer computation | proof-style derivation",
  "question_text": "the student-facing question",
  "hint": "one helpful hint that does not give away the answer",
  "correct_answer": "the final answer",
  "solution_steps": ["step 1", "step 2"]
}}
""".strip()

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        question = parse_json_object(response.content[0].text)
        return QuestionResponse(**question)
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=3001)
