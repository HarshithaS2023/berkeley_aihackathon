import os
from typing import Any

_tracer_provider: Any | None = None


def init_arize_tracing() -> Any | None:
    """Register Arize AX tracing for Anthropic SDK calls. Returns None if disabled."""
    global _tracer_provider

    space_id = os.getenv("ARIZE_SPACE_ID")
    api_key = os.getenv("ARIZE_API_KEY")
    if not space_id or not api_key:
        return None

    from arize.otel import register
    from openinference.instrumentation.anthropic import AnthropicInstrumentor

    _tracer_provider = register(
        space_id=space_id,
        api_key=api_key,
        project_name=os.getenv("ARIZE_PROJECT_NAME", "quizcraft"),
    )
    AnthropicInstrumentor().instrument(tracer_provider=_tracer_provider)
    return _tracer_provider


def shutdown_arize_tracing() -> None:
    """Flush and shut down the tracer provider on app teardown."""
    global _tracer_provider
    if _tracer_provider is None:
        return
    _tracer_provider.shutdown()
    _tracer_provider = None


def is_arize_configured() -> bool:
    return _tracer_provider is not None
