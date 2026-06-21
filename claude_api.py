import asyncio
import json
import os
import time
import uuid as _uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator
from typing import Literal

import anthropic
import httpx
from anthropic import APIError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

# override=True ensures values in .env win over any shell variables
# (e.g. a local Ollama setup exporting ANTHROPIC_MODEL / ANTHROPIC_BASE_URL).
load_dotenv(override=True)

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
    files: list[FileItem]


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

    if not content:
        return {"topics": ["General"], "concepts": [], "styleNotes": ""}

    content.append({
        "type": "text",
        "text": (
            "Analyze this study material. Respond ONLY with valid JSON, no other text:\n"
            '{"topics": ["3-5 main topic names"], '
            '"concepts": ["5-10 key concepts, terms, or formulas"], '
            '"styleNotes": "one sentence on the question style and difficulty level"}'
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
        f"Return ONLY a valid JSON array with exactly {body.count} objects, no other text:\n"
        '[{"question":"...","hints":["hint that does not give away the answer"],"answer":"...","solution":"step-by-step explanation","concepts":["concept1"]}]'
    )


def normalize_questions(items: list, body: BatchQuestionRequest) -> list[dict]:
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
    # Scale tokens with how many questions we ask for instead of a flat large cap.
    max_tokens = min(3000, 500 + 400 * max(1, body.count))

    response = await client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text
    items = parse_json_array(text)
    return normalize_questions(items, body)


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
        queue.params = params
        queue.cancelled = False
        queue.target_remaining = max(queue.target_remaining, target_remaining - queue.questions.qsize())

    ensure_question_queue_filling(body.session_id)
    return {"session_id": body.session_id, "status": "warming"}


@app.post("/generate-questions")
async def generate_questions_batch(body: BatchQuestionRequest):
    try:
        return await create_question_batch(body)
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc


# ── Analyze Work (single collapsed call) ──────────────────────────────────────

class WorkSubmission(BaseModel):
    image_base64: str | None = None
    work_text: str | None = None
    correct_answer: str
    prior_errors: list[str]


class LivePeekRequest(BaseModel):
    image_base64: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1)
    correct_answer: str | None = None


def build_work_analysis_content(body: WorkSubmission):
    if not body.work_text and not body.image_base64:
        raise HTTPException(status_code=400, detail="Provide image_base64 or work_text.")

    instructions = (
        "You are a warm, precise math tutor. Evaluate the student's work in ONE pass.\n\n"
        f"Correct answer: {body.correct_answer}\n"
        f"Prior errors this session: {json.dumps(body.prior_errors)}\n\n"
        "Look at the student's work below. Decide if their final answer is correct, "
        "find where they diverged (if at all), check whether this repeats one of the "
        "prior errors, and write feedback.\n\n"
        "Respond ONLY with valid JSON, no other text:\n"
        '{"correct": true/false, '
        '"analysis": "specific explanation of where the work diverged, cite the step", '
        '"is_repeated": true/false, '
        '"gap": "one sentence on the underlying concept gap", '
        '"feedback": "warm Khan Academy-style feedback, 2-3 sentences"}'
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


def normalize_work_analysis(data: dict) -> dict:
    is_correct = bool(data.get("correct", False))
    return {
        "correct": is_correct,
        "error_found": not is_correct,
        "error_type": data.get("analysis", ""),
        "is_repeated_pattern": bool(data.get("is_repeated", False)),
        "conceptual_gap": data.get("gap", ""),
        "feedback_text": data.get("feedback", ""),
    }


@app.post("/live-peek")
async def live_peek(body: LivePeekRequest):
    prompt = (
        "Student is mid-work on a whiteboard for this question:\n"
        f"{body.question}\n\n"
        "Look for major conceptual errors, sign errors, arithmetic errors, etc."
        "Give ONE concise summary if the student is on the right track or not."
        "Do not second-guess yourself."
        "Do not reveal the answer or final result."
    )
    if body.correct_answer:
        prompt += "\nUse the correct answer only to avoid misleading them; do not reveal it."

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=60,
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
        return {"peek": response.content[0].text.strip()}
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


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

    return normalize_work_analysis(data)


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
            yield f"event: done\ndata: {json.dumps(normalize_work_analysis(data))}\n\n"
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
        question = parse_json_object(response.content[0].text, "generate-question")
        return QuestionResponse(**question)
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=3001)
