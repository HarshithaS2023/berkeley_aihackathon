import anthropic
import json
import os
import uuid as _uuid
from typing import Literal

from anthropic import APIError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic()
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")


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
        response = client.messages.create(
            model=MODEL,
            max_tokens=800,
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

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=4000,
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


# ── Analyze Work ──────────────────────────────────────────────────────────────

class WorkSubmission(BaseModel):
    image_base64: str | None = None
    work_text: str | None = None
    correct_answer: str
    prior_errors: list[str]


@app.post("/analyze-work")
async def analyze_work(body: WorkSubmission):
    try:
        if body.work_text:
            description = body.work_text
        elif body.image_base64:
            # Step 1 — Vision: describe what the student wrote
            step1 = client.messages.create(
                model=MODEL,
                max_tokens=1000,
                messages=[{
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
                        {
                            "type": "text",
                            "text": "Describe exactly what this student wrote, step by step. Be precise, no judgment yet.",
                        },
                    ],
                }]
            )
            description = step1.content[0].text
        else:
            raise HTTPException(status_code=400, detail="Provide image_base64 or work_text.")

        # Step 2 — Compare: determine correctness and where they diverged
        step2 = client.messages.create(
            model=MODEL,
            max_tokens=1000,
            messages=[{
                "role": "user",
                "content": (
                    f"Student's work: {description}\n\n"
                    f"Correct answer: {body.correct_answer}\n\n"
                    "Is the student's answer correct? Where did their work diverge (if at all)? "
                    'Respond ONLY in JSON: {"correct": true/false, "analysis": "specific explanation"}'
                ),
            }]
        )
        step2_data = parse_json_object(step2.content[0].text)
        is_correct = step2_data.get("correct", False)
        error_analysis = step2_data.get("analysis", "")

        # Step 3 — Pattern Check
        step3 = client.messages.create(
            model=MODEL,
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": (
                    f"Prior errors this session: {json.dumps(body.prior_errors)}\n\n"
                    f"Current analysis: {error_analysis}\n\n"
                    'Respond ONLY in JSON: {"is_repeated": true/false, "gap": "one sentence on the underlying concept gap"}'
                ),
            }]
        )
        pattern = parse_json_object(step3.content[0].text)

        # Step 4 — Feedback
        step4 = client.messages.create(
            model=MODEL,
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": (
                    f"Write warm, specific tutoring feedback.\n\n"
                    f"Correct: {is_correct}\n"
                    f"What they did: {description}\n"
                    f"Analysis: {error_analysis}\n"
                    f"Concept gap: {pattern['gap']}\n\n"
                    "Khan Academy tone, 2-3 sentences."
                ),
            }]
        )

        return {
            "correct": is_correct,
            "error_found": not is_correct,
            "error_type": error_analysis,
            "is_repeated_pattern": pattern["is_repeated"],
            "conceptual_gap": pattern["gap"],
            "feedback_text": step4.content[0].text,
        }
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc


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
        response = client.messages.create(
            model=MODEL,
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        question = parse_json_object(response.content[0].text)
        return QuestionResponse(**question)
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc
