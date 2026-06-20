import anthropic
import json
import os

from anthropic import APIError
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

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