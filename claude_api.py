import json
import os
import uuid

import anthropic
from anthropic import APIError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

app = FastAPI(title="QuizCraft API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic()
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")


def parse_json_object(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in model response")
    return json.loads(text[start : end + 1])


def ask_model(prompt: str, max_tokens: int = 1000) -> str:
    response = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


def clamp_difficulty(value: int) -> int:
    return max(1, min(3, int(value)))


def difficulty_band(level: int) -> str:
    if level <= 1:
        return "easy"
    if level == 2:
        return "medium"
    return "hard"


# ---------------------------------------------------------------------------
# Shared schemas (mirror the frontend contract in src/types.ts)
# ---------------------------------------------------------------------------


class SourceProfile(BaseModel):
    topics: list[str] = Field(default_factory=list)
    concepts: list[str] = Field(default_factory=list)
    styleNotes: str = ""


class GenerateQuestionRequest(BaseModel):
    sourceProfile: SourceProfile
    currentDifficulty: int = 2
    problemType: str = "word_problem"
    similarity: str = "same_concepts"
    previousQuestions: list[str] = Field(default_factory=list)
    weakAreas: list[str] = Field(default_factory=list)


class Question(BaseModel):
    id: str
    question: str
    hints: list[str]
    answer: str
    solution: str
    difficulty: int
    concepts: list[str]


class WorkSubmission(BaseModel):
    responseTimeSeconds: int = 0
    answerText: str | None = None
    whiteboardImageBase64: str | None = None
    uploadedWorkFileBase64: str | None = None
    hintsUsed: int = 0


class AnalyzeWorkRequest(BaseModel):
    question: Question
    submission: WorkSubmission


class SessionResultModel(BaseModel):
    question: Question
    submission: WorkSubmission
    feedback: dict


class GenerateSummaryRequest(BaseModel):
    results: list[SessionResultModel] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": MODEL}


@app.post("/generate-question", response_model=Question)
async def generate_question(body: GenerateQuestionRequest) -> Question:
    level = clamp_difficulty(body.currentDifficulty)
    band = difficulty_band(level)

    similarity_guidance = {
        "very_similar": "Closely mirror the style of the source material.",
        "same_concepts": "Test the same concepts with fresh numbers or phrasing.",
        "concept_transfer": "Apply the concepts to a noticeably different scenario.",
    }.get(body.similarity, "Test the same concepts with fresh numbers or phrasing.")

    prompt = f"""
You are generating one quiz question for a student.

Source topics: {json.dumps(body.sourceProfile.topics)}
Source concepts: {json.dumps(body.sourceProfile.concepts)}
Style notes: {body.sourceProfile.styleNotes or "None"}

Problem type: {body.problemType}
Similarity goal: {body.similarity} - {similarity_guidance}
Difficulty: level {level} of 3 ({band}).
Student weak areas to reinforce: {json.dumps(body.weakAreas)}

Do not repeat any of these prior questions:
{json.dumps(body.previousQuestions)}

Return ONLY valid JSON with this exact schema:
{{
  "question": "the student-facing question",
  "hints": ["hint 1", "hint 2"],
  "answer": "the final answer",
  "solution": "a concise worked solution",
  "concepts": ["concept", "concept"]
}}
""".strip()

    try:
        data = parse_json_object(ask_model(prompt))
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc

    hints = data.get("hints") or []
    if isinstance(hints, str):
        hints = [hints]

    concepts = data.get("concepts") or body.sourceProfile.concepts or body.sourceProfile.topics

    return Question(
        id=str(uuid.uuid4()),
        question=str(data.get("question", "")).strip(),
        hints=[str(hint) for hint in hints][:3],
        answer=str(data.get("answer", "")).strip(),
        solution=str(data.get("solution", "")).strip(),
        difficulty=level,
        concepts=[str(concept) for concept in concepts][:5],
    )


def normalize_base64_image(image_data: str) -> str:
    if "," in image_data and image_data.strip().startswith("data:"):
        return image_data.split(",", 1)[1]
    return image_data


def describe_image(image_data: str, media_type: str = "image/png") -> str:
    response = client.messages.create(
        model=MODEL,
        max_tokens=1000,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": normalize_base64_image(image_data),
                        },
                    },
                    {
                        "type": "text",
                        "text": "Describe exactly what this student wrote, step by step. Be precise, no judgment yet.",
                    },
                ],
            }
        ],
    )
    return response.content[0].text


def describe_work(submission: WorkSubmission) -> str:
    """Turn a submission into a textual description of the student's work."""
    if submission.whiteboardImageBase64:
        return describe_image(submission.whiteboardImageBase64, "image/png")

    if submission.uploadedWorkFileBase64:
        # Uploaded homework photos are usually JPEG; Claude accepts png/jpeg/webp/gif.
        return describe_image(submission.uploadedWorkFileBase64, "image/jpeg")

    if submission.answerText:
        return f"The student's final answer: {submission.answerText}"

    return "The student did not show any work."


@app.post("/analyze-work")
async def analyze_work(body: AnalyzeWorkRequest) -> dict:
    question = body.question

    try:
        work_description = describe_work(body.submission)

        prompt = f"""
You are a warm, precise math tutor evaluating a student's work.

Question: {question.question}
Correct answer: {question.answer}
Worked solution: {question.solution}
Concepts being tested: {json.dumps(question.concepts)}
Hints the student used: {body.submission.hintsUsed}

Student's work / answer:
{work_description}

Decide whether the student's answer is correct, then give feedback.
Return ONLY valid JSON with this exact schema:
{{
  "correct": true or false,
  "score": a number between 0 and 1,
  "feedback": "2-4 sentences, Khan Academy tone, reference the specific step if there is an error",
  "errorPatterns": ["short phrase describing each conceptual error, empty if correct"],
  "strengths": ["short phrase describing what the student did well"],
  "suggestedNextStep": "one actionable next step",
  "recommendedDifficulty": an integer 1-3 for the next question
}}
""".strip()

        data = parse_json_object(ask_model(prompt))
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc

    recommended = data.get("recommendedDifficulty", question.difficulty)
    try:
        recommended = clamp_difficulty(recommended)
    except (TypeError, ValueError):
        recommended = question.difficulty

    error_patterns = data.get("errorPatterns") or []
    if isinstance(error_patterns, str):
        error_patterns = [error_patterns]
    strengths = data.get("strengths") or []
    if isinstance(strengths, str):
        strengths = [strengths]

    return {
        "correct": bool(data.get("correct", False)),
        "score": float(data.get("score", 0)),
        "feedback": str(data.get("feedback", "")).strip(),
        "errorPatterns": [str(item) for item in error_patterns],
        "strengths": [str(item) for item in strengths],
        "suggestedNextStep": str(data.get("suggestedNextStep", "")).strip(),
        "recommendedDifficulty": recommended,
    }


@app.post("/generate-summary")
async def generate_summary(body: GenerateSummaryRequest) -> dict:
    results = body.results
    total = len(results)

    correct_count = sum(1 for r in results if r.feedback.get("correct"))
    accuracy = correct_count / total if total else 0.0

    total_time = sum(r.submission.responseTimeSeconds for r in results)
    average_time = round(total_time / total) if total else 0

    missed_concepts: list[str] = []
    common_mistakes: list[str] = []
    strengths: list[str] = []
    for r in results:
        if not r.feedback.get("correct"):
            missed_concepts.extend(r.question.concepts)
        common_mistakes.extend(r.feedback.get("errorPatterns", []) or [])
        strengths.extend(r.feedback.get("strengths", []) or [])

    def dedupe(items: list[str]) -> list[str]:
        return list(dict.fromkeys(item for item in items if item))

    missed_concepts = dedupe(missed_concepts)
    common_mistakes = dedupe(common_mistakes)
    strengths = dedupe(strengths)

    suggested_next_steps = dedupe(
        [r.feedback.get("suggestedNextStep", "") for r in results]
    )

    try:
        prompt = f"""
A student finished a {total}-question practice session.
Accuracy: {round(accuracy * 100)}%.
Missed concepts: {json.dumps(missed_concepts)}
Recurring mistakes: {json.dumps(common_mistakes)}
Strengths: {json.dumps(strengths)}

Write 2-4 concrete, encouraging next steps for this student.
Return ONLY valid JSON: {{"suggestedNextSteps": ["step 1", "step 2"]}}
""".strip()
        ai_steps = parse_json_object(ask_model(prompt, max_tokens=500)).get(
            "suggestedNextSteps"
        )
        if ai_steps:
            suggested_next_steps = [str(step) for step in ai_steps]
    except (APIError, ValueError, json.JSONDecodeError):
        # Fall back to the deterministic per-question next steps already collected.
        pass

    return {
        "accuracy": accuracy,
        "averageResponseTimeSeconds": average_time,
        "mostMissedConcepts": missed_concepts,
        "commonMistakes": common_mistakes,
        "strengths": strengths,
        "suggestedNextSteps": suggested_next_steps,
    }
