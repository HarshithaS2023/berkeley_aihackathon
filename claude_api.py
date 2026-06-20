import anthropic
import json
import os
from typing import Literal

from anthropic import APIError
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI()
client = anthropic.Anthropic()
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")


def parse_json_object(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in Claude response")
    return json.loads(text[start : end + 1])

class WorkSubmission(BaseModel):
    image_base64: str | None = None
    work_text: str | None = None
    correct_answer: str
    prior_errors: list[str]


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


def create_question(body: QuestionRequest) -> QuestionResponse:
    difficulty_guidance = {
        "easy": "Use direct recall or a one-step application. Keep numbers simple.",
        "medium": "Use a two- to three-step problem that requires applying the concept.",
        "hard": "Use a multi-step problem that combines ideas or asks for deeper reasoning."
    }

    prompt = f"""
Create one STEM quiz question for a student.

Topic selected by the user: {body.topic}
Difficulty: {body.difficulty}
Difficulty guidance: {difficulty_guidance[body.difficulty]}

Material context, if any:
{body.material_context or "No source material provided."}

Prior questions to avoid repeating:
{json.dumps(body.prior_questions)}

Return only valid JSON with this schema:
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

    response = client.messages.create(
        model=MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}]
    )
    question = parse_json_object(response.content[0].text)
    return QuestionResponse(**question)


@app.post("/generate-question")
async def generate_question(body: QuestionRequest):
    try:
        return create_question(body)
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc


@app.post("/analyze-work")
async def analyze_work(body: WorkSubmission):
    try:
        if body.work_text:
            description = body.work_text
        elif body.image_base64:
            # Step 1 — Vision
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
                                "data": body.image_base64
                            }
                        },
                        {
                            "type": "text",
                            "text": "Describe exactly what this student wrote, step by step. Be precise, no judgment yet."
                        }
                    ]
                }]
            )
            description = step1.content[0].text
        else:
            raise HTTPException(status_code=400, detail="Provide image_base64 or work_text.")

        # Step 2 — Compare
        step2 = client.messages.create(
            model=MODEL,
            max_tokens=1000,
            messages=[{
                "role": "user",
                "content": f"Student's work: {description}\n\nCorrect solution: {body.correct_answer}\n\nWhere exactly did their work diverge? Be specific about the step."
            }]
        )
        error_analysis = step2.content[0].text

        # Step 3 — Pattern Check
        step3 = client.messages.create(
            model=MODEL,
            max_tokens=1000,
            messages=[{
                "role": "user",
                "content": f"Prior errors this session: {json.dumps(body.prior_errors)}\n\nNew error: {error_analysis}\n\nRespond only in JSON: {{\"is_repeated\": true/false, \"gap\": \"one sentence on the underlying concept\"}}"
            }]
        )
        pattern = parse_json_object(step3.content[0].text)

        # Step 4 — Feedback
        step4 = client.messages.create(
            model=MODEL,
            max_tokens=1000,
            messages=[{
                "role": "user",
                "content": f"Write warm, specific tutoring feedback.\n\nWhat they did: {description}\nWhere wrong: {error_analysis}\nPattern: {pattern['gap']}\n\nKhan Academy tone, 3-4 sentences."
            }]
        )

        return {
            "error_found": True,
            "error_type": error_analysis,
            "is_repeated_pattern": pattern["is_repeated"],
            "conceptual_gap": pattern["gap"],
            "feedback_text": step4.content[0].text
        }
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid model response: {exc}") from exc