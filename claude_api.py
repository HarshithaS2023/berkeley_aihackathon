import asyncio
import json
import os
import re
import time
import uuid as _uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator
from typing import Literal

from dotenv import load_dotenv

# override=True ensures values in .env win over any shell variables
# (e.g. a local Ollama setup exporting ANTHROPIC_MODEL / ANTHROPIC_BASE_URL).
load_dotenv(override=True)

from instrumentation import init_arize_tracing, is_arize_configured, shutdown_arize_tracing

init_arize_tracing()

import anthropic
import httpx
from anthropic import APIError
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

# Force the Anthropic cloud API. We pass api_key and base_url explicitly so a
# local proxy configured via ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN (Ollama)
# cannot redirect these calls.
API_KEY = os.environ.get("ANTHROPIC_API_KEY")
BASE_URL = os.getenv("CLAUDE_BASE_URL", "https://api.anthropic.com")
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6-20251001")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
DEEPGRAM_SPEAK_MODEL = os.getenv("DEEPGRAM_SPEAK_MODEL", "aura-2-asteria-en")

client = anthropic.AsyncAnthropic(api_key=API_KEY, base_url=BASE_URL)
deepgram_http_client: httpx.AsyncClient | None = None


@dataclass
class SessionQueue:
    questions: asyncio.Queue[dict]
    params: "BatchQuestionRequest"
    target_remaining: int
    fill_task: asyncio.Task | None = None
    cancelled: bool = False


background_tasks: set[asyncio.Task] = set()
session_queues: dict[str, SessionQueue] = {}


# region agent log
def agent_log(message: str, data: dict, hypothesis_id: str) -> None:
    payload = {
        "sessionId": "3f0251",
        "runId": "json-object-initial",
        "hypothesisId": hypothesis_id,
        "location": "claude_api.py",
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    try:
        with open("debug-3f0251.log", "a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(payload) + "\n")
    except Exception:
        pass
# endregion


def track_task(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)
    return task


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
    for task in list(background_tasks):
        task.cancel()
    if background_tasks:
        await asyncio.gather(*background_tasks, return_exceptions=True)
    background_tasks.clear()
    for queue in session_queues.values():
        queue.cancelled = True
        if queue.fill_task:
            queue.fill_task.cancel()
    session_queues.clear()
    if deepgram_http_client:
        await deepgram_http_client.aclose()
    deepgram_http_client = None
    shutdown_arize_tracing()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_json_object(text: str, context: str = "unknown") -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        # region agent log
        agent_log(
            "json object markers missing",
            {
                "context": context,
                "model": MODEL,
                "text_length": len(text),
                "starts_with": text[:300],
                "ends_with": text[-300:],
            },
            "A,B,C,D",
        )
        # endregion
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
        "arizeConfigured": is_arize_configured(),
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
            params={"model": DEEPGRAM_SPEAK_MODEL, "encoding": "mp3"},
            headers={
                "Authorization": f"Token {DEEPGRAM_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"text": text},
        )
        if response.is_error:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Deepgram text-to-speech failed: "
                    f"{response.status_code} {response.text[:300]}"
                ),
            )
        content_type = response.headers.get("content-type", "")
        if not response.content or not content_type.startswith("audio/"):
            raise HTTPException(
                status_code=502,
                detail=(
                    "Deepgram returned an invalid audio response "
                    f"({content_type or 'unknown content type'})."
                ),
            )
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Deepgram text-to-speech failed: {exc}",
        ) from exc

    return Response(
        content=response.content,
        media_type=response.headers.get("content-type", "audio/mpeg").split(";")[0],
        headers={"Cache-Control": "no-store"},
    )


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
        return parse_json_object(response.content[0].text, "analyze-source")
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


class QuestionQueueWarmRequest(BatchQuestionRequest):
    session_id: str
    total_needed: int = 3


class QuestionQueueNextRequest(BaseModel):
    session_id: str


class QuestionQueueRefillRequest(BatchQuestionRequest):
    session_id: str
    remaining: int = 1


def batch_max_tokens(count: int) -> int:
    # Batches of 3 with hints + solutions need more headroom or JSON gets truncated mid-string.
    return min(8192, 1200 + 900 * max(1, count))


_QUESTION_JSON_RULES = (
    "Return ONLY a valid JSON array — no markdown fences or commentary. "
    "Use double quotes for all strings. Do not put raw newlines inside strings. "
    "Keep each solution field to at most 2 short sentences."
)


def build_question_prompt(body: BatchQuestionRequest) -> str:
    difficulty_label = _DIFFICULTY_LABEL.get(body.difficulty, "medium")
    avoid = json.dumps(body.previous_questions[:10]) if body.previous_questions else "none"

    return (
        f"Generate exactly {body.count} distinct quiz questions for a student.\n\n"
        f"Topics: {', '.join(body.topics) or 'general'}\n"
        f"Key concepts: {', '.join(body.concepts) or 'as appropriate'}\n"
        f"Style notes: {body.style_notes or 'standard questions'}\n"
        f"Difficulty: {difficulty_label}\n"
        f"Problem type: {body.problem_type.replace('_', ' ')}\n"
        f"Weak areas to reinforce: {', '.join(body.weak_areas) if body.weak_areas else 'none yet'}\n"
        f"Do NOT repeat these already-asked questions: {avoid}\n\n"
        f"{_QUESTION_JSON_RULES}\n"
        f"Return exactly {body.count} objects in this shape:\n"
        '[{"question":"...","hints":["one hint"],"answer":"...","solution":"brief steps","concepts":["concept1"]}]'
    )


def normalize_questions(items: list, body: BatchQuestionRequest) -> list[dict]:
    if not items:
        raise ValueError("Model returned an empty question list")
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
        for item in items[: body.count]
    ]


def question_request_with_count(body: BatchQuestionRequest, count: int) -> BatchQuestionRequest:
    return BatchQuestionRequest(
        topics=body.topics,
        concepts=body.concepts,
        style_notes=body.style_notes,
        difficulty=body.difficulty,
        problem_type=body.problem_type,
        weak_areas=body.weak_areas,
        previous_questions=body.previous_questions,
        count=count,
    )


async def create_question_batch(body: BatchQuestionRequest) -> list[dict]:
    prompt = build_question_prompt(body)
    max_tokens = batch_max_tokens(body.count)
    last_error: Exception | None = None

    for attempt in range(2):
        try:
            response = await client.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            items = parse_json_array(response.content[0].text)
            if len(items) < body.count:
                raise ValueError(
                    f"Expected {body.count} questions, got {len(items)}"
                )
            return normalize_questions(items, body)
        except (KeyError, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            max_tokens = min(8192, max_tokens + 2000)
            prompt = (
                build_question_prompt(body)
                + "\n\nYour previous response was invalid or truncated. "
                "Return compact valid JSON with shorter solution fields."
            )

    previous = list(body.previous_questions)
    collected: list[dict] = []
    for _ in range(body.count):
        single = body.model_copy(update={"count": 1, "previous_questions": previous})
        response = await client.messages.create(
            model=MODEL,
            max_tokens=1200,
            messages=[{"role": "user", "content": build_question_prompt(single)}],
        )
        try:
            items = parse_json_array(response.content[0].text)
            normalized = normalize_questions(items, single)
        except (KeyError, ValueError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid model response: {last_error or exc}",
            ) from exc
        collected.append(normalized[0])
        previous.append(normalized[0]["question"])
    return collected


async def fill_question_queue(session_id: str) -> None:
    queue = session_queues.get(session_id)
    if not queue:
        return

    while not queue.cancelled and queue.target_remaining > 0 and queue.questions.qsize() < 3:
        count = min(3 - queue.questions.qsize(), queue.target_remaining)
        if count <= 0:
            return

        try:
            body = question_request_with_count(queue.params, count)
            questions = await create_question_batch(body)
        except Exception:
            await asyncio.sleep(1)
            try:
                body = question_request_with_count(queue.params, count)
                questions = await create_question_batch(body)
            except Exception:
                return

        for question in questions:
            await queue.questions.put(question)
        queue.target_remaining = max(0, queue.target_remaining - len(questions))


def ensure_question_queue_filling(session_id: str) -> None:
    queue = session_queues.get(session_id)
    if not queue or queue.cancelled:
        return
    if queue.fill_task and not queue.fill_task.done():
        return
    queue.fill_task = track_task(fill_question_queue(session_id))


@app.post("/question-queue/warm")
async def warm_question_queue(body: QuestionQueueWarmRequest):
    params = question_request_with_count(body, min(3, max(1, body.total_needed)))
    existing = session_queues.get(body.session_id)
    if existing and existing.fill_task:
        existing.cancelled = True
        existing.fill_task.cancel()

    session_queues[body.session_id] = SessionQueue(
        questions=asyncio.Queue(),
        params=params,
        target_remaining=max(0, body.total_needed),
    )
    ensure_question_queue_filling(body.session_id)
    return {"session_id": body.session_id, "status": "warming"}


@app.post("/question-queue/next")
async def next_queued_question(body: QuestionQueueNextRequest):
    queue = session_queues.get(body.session_id)
    if not queue:
        return Response(status_code=204)

    ensure_question_queue_filling(body.session_id)
    try:
        question = await asyncio.wait_for(queue.questions.get(), timeout=2.0)
    except asyncio.TimeoutError:
        return Response(status_code=204)

    ensure_question_queue_filling(body.session_id)
    return question


@app.post("/question-queue/refill")
async def refill_question_queue(body: QuestionQueueRefillRequest):
    params = question_request_with_count(body, min(3, max(1, body.remaining)))
    queue = session_queues.get(body.session_id)
    target_remaining = max(0, body.remaining)
    if not queue:
        session_queues[body.session_id] = SessionQueue(
            questions=asyncio.Queue(),
            params=params,
            target_remaining=target_remaining,
        )
    else:
        # Any queued questions were generated from the previous adaptive state.
        # Discard them so the next question reflects the latest difficulty and
        # weak areas instead of showing stale values in the session graph.
        if queue.fill_task and not queue.fill_task.done():
            queue.fill_task.cancel()
        while not queue.questions.empty():
            try:
                queue.questions.get_nowait()
            except asyncio.QueueEmpty:
                break
        queue.params = params
        queue.cancelled = False
        queue.target_remaining = target_remaining
        queue.fill_task = None

    ensure_question_queue_filling(body.session_id)
    return {"session_id": body.session_id, "status": "warming"}


@app.post("/generate-questions")
async def generate_questions_batch(body: BatchQuestionRequest):
    try:
        return await create_question_batch(body)
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


class CompetitionQuestionsRequest(BaseModel):
    topics: list[str]
    concepts: list[str]
    style_notes: str = ""
    starting_difficulty: int = 3
    problem_type: str = "word_problem"
    num_questions: int = 5


@app.post("/generate-competition-questions")
async def generate_competition_questions(body: CompetitionQuestionsRequest):
    """Generate all questions for a competition session upfront with a difficulty ramp.
    Both players will receive the exact same pre-generated question set."""
    n = body.num_questions
    d = min(max(body.starting_difficulty, 1), 4)  # cap base so ramp fits in 1-5

    # Difficulty ramp: 40% easy, 40% medium+1, 20% hard+2
    g1 = max(1, round(n * 0.4))
    g3 = max(0, round(n * 0.2))
    g2 = n - g1 - g3
    groups = [(count, min(d + offset, 5)) for count, offset in [(g1, 0), (g2, 1), (g3, 2)] if count > 0]

    try:
        batches = await asyncio.gather(*[
            create_question_batch(
                BatchQuestionRequest(
                    topics=body.topics,
                    concepts=body.concepts,
                    style_notes=body.style_notes,
                    difficulty=difficulty,
                    problem_type=body.problem_type,
                    weak_areas=[],
                    previous_questions=[],
                    count=count,
                )
            )
            for count, difficulty in groups
        ])
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return [q for batch in batches for q in batch]


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


class LivePeekRequest(BaseModel):
    image_base64: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1)
    correct_answer: str | None = None


def normalize_live_advice(value: str) -> str:
    text = re.sub(r"[*_`#]+", "", value).strip()
    sentences = re.split(r"(?<=[.!?])\s+", text)
    narration_markers = (
        "the image",
        "image appears",
        "i can see",
        "it appears",
        "the whiteboard shows",
        "work isn't visible",
        "work is not visible",
        "encourage them",
    )
    useful = [
        sentence
        for sentence in sentences
        if sentence and not any(marker in sentence.lower() for marker in narration_markers)
    ]
    text = " ".join(useful).strip()
    replacements = (
        (r"\b[Tt]he student\b", "you"),
        (r"\b[Ss]tudent\b", "you"),
        (r"\b[Tt]hey\b", "you"),
        (r"\b[Tt]heir\b", "your"),
        (r"\b[Tt]hem\b", "you"),
    )
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text)
    if text:
        text = text[0].upper() + text[1:]
    return text


def build_work_analysis_content(body: WorkSubmission):
    if not body.work_text and not body.image_base64:
        raise HTTPException(status_code=400, detail="Provide image_base64 or work_text.")

    instructions = (
        "You are a warm, precise math tutor. Evaluate the student's work in ONE pass.\n\n"
        f"Question: {body.question}\n"
        f"Correct answer: {body.correct_answer}\n"
        f"Expected solution: {body.expected_solution or 'Not provided'}\n"
        f"Student's typed final answer: {body.work_text or 'Not provided'}\n"
        f"Prior errors this session: {json.dumps(body.prior_errors)}\n\n"
        "GRADING RULES — follow these exactly:\n"
        "1. 'correct' is ONLY true when the student's final answer matches the correct "
        "answer exactly or is numerically equivalent. Correct intermediate work, correct "
        "derivations, or correct methods WITHOUT arriving at the correct final answer must "
        "be marked correct=false.\n"
        "2. 'partially_correct' is true when the student's method or derivation is right "
        "but the final answer is missing, wrong, or the student stopped before substituting "
        "or simplifying to reach the final answer.\n"
        "3. Treat the typed final answer as authoritative when provided. Use the image "
        "to inspect intermediate work. Identify the first visible step that diverges "
        "from the expected solution.\n"
        "4. Never invent a submitted answer or claim a numerical difference; the server "
        "calculates numeric differences. If the work is unreadable or no exact incorrect "
        "step is visible, say so plainly.\n\n"
        "Respond ONLY with valid JSON, no other text:\n"
        '{"correct": true/false, '
        '"partially_correct": true/false, '
        '"submitted_answer": "typed answer, or final answer read from image", '
        '"first_incorrect_step": "first incorrect step, or empty string", '
        '"is_repeated": true/false, '
        '"gap": "one sentence on the underlying concept gap", '
        '"strength": "specific skill demonstrated well, or empty string", '
        '"next_step": "one concrete, concept-specific practice action", '
        '"feedback": "warm, specific feedback without unsupported arithmetic claims"}'
    )

    if body.image_base64:
        return [
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

    return f"Student's work / answer:\n{body.work_text}\n\n{instructions}"


def normalize_work_analysis(data: dict, body: WorkSubmission) -> dict:
    is_correct = bool(data.get("correct", False))
    partially_correct = bool(data.get("partially_correct", False))
    typed_answer = body.work_text.strip() if body.work_text else None
    submitted_answer = typed_answer or str(data.get("submitted_answer", "")).strip()
    submitted_number = parse_numeric_answer(submitted_answer)
    expected_number = parse_numeric_answer(body.correct_answer)
    numerical_difference = (
        abs(expected_number - submitted_number)
        if submitted_number is not None and expected_number is not None
        else None
    )

    # Strict final-answer check: numeric typed answers override Claude's assessment.
    if typed_answer and submitted_number is not None and expected_number is not None:
        is_correct = abs(expected_number - submitted_number) < 1e-9

    # Partially correct work is never marked correct regardless of what Claude said.
    if partially_correct:
        is_correct = False

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
        "partially_correct": partially_correct and not is_correct,
        "error_found": not is_correct,
        "submitted_answer": submitted_answer,
        "expected_answer": body.correct_answer,
        "numerical_difference": numerical_difference,
        "first_incorrect_step": data.get("first_incorrect_step", ""),
        "is_repeated_pattern": bool(data.get("is_repeated", False)),
        "conceptual_gap": data.get("gap", ""),
        "strength": data.get("strength", ""),
        "next_step": data.get("next_step", ""),
        "feedback_text": feedback_text,
    }


@app.post("/live-peek")
async def live_peek(body: LivePeekRequest):
    prompt = (
        "You are giving live coaching directly to a learner working on this question:\n"
        f"{body.question}\n\n"
        "Inspect the whiteboard for conceptual, sign, arithmetic, or setup errors. "
        "Address the learner only as 'you' or 'your'—never say 'the student'. "
        "Do not describe the image, handwriting, visibility, or what you are thinking. "
        "Do not say phrases like 'the image shows', 'I can see', or 'it appears'. "
        "Give only useful coaching or a next action. If work has barely started, give "
        "a concrete first step tied to the problem instead of commenting that no work "
        "is visible. Do not reveal the answer or final result.\n\n"
        "Return ONLY valid JSON with this shape:\n"
        '{"advice":"one or two direct, specific coaching sentences",'
        '"spoken_advice":"one calm actionable sentence of at most 12 words"}'
    )
    if body.correct_answer:
        prompt += "\nUse the correct answer only to avoid misleading the learner; do not reveal it."

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=140,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": body.image_base64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        data = parse_json_object(response.content[0].text, "live-peek")
        advice = normalize_live_advice(str(data.get("advice", "")))
        spoken_advice = normalize_live_advice(str(data.get("spoken_advice", "")))
        if not advice:
            advice = "Begin by identifying the quantities and how they are connected."
        return {
            "peek": advice,
            "spoken": spoken_advice or advice.split(".")[0].strip(),
        }
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid live feedback: {exc}") from exc


@app.post("/analyze-work")
async def analyze_work(body: WorkSubmission):
    user_content = build_work_analysis_content(body)

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=600,
            messages=[{"role": "user", "content": user_content}],
        )
        data = parse_json_object(response.content[0].text, "analyze-work")
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc

    return normalize_work_analysis(data, body)


async def stream_work_analysis(body: WorkSubmission) -> AsyncIterator[str]:
    user_content = build_work_analysis_content(body)

    try:
        async with client.messages.stream(
            model=MODEL,
            max_tokens=600,
            messages=[{"role": "user", "content": user_content}],
        ) as stream:
            async for text in stream.text_stream:
                yield f"event: delta\ndata: {json.dumps({'text': text})}\n\n"

            final = await stream.get_final_message()
            data = parse_json_object(final.content[0].text, "analyze-work-stream")
            yield f"event: done\ndata: {json.dumps(normalize_work_analysis(data, body))}\n\n"
    except Exception as exc:
        yield f"event: error\ndata: {json.dumps({'detail': str(exc)})}\n\n"


@app.post("/analyze-work/stream")
async def analyze_work_stream(body: WorkSubmission):
    return StreamingResponse(stream_work_analysis(body), media_type="text/event-stream")


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
Create one quiz question for a student.

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
        question = parse_json_object(response.content[0].text, "generate-question")
        return QuestionResponse(**question)
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=3001)
