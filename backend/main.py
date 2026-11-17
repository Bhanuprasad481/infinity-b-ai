
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai


# ==========================================
# 1. LOAD ENVIRONMENT VARIABLES
# ==========================================

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent

# Local development: load prompt.env if available.
# Render deployment: reads environment variables from Render.
load_dotenv(PROJECT_DIR / "prompt.env")

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is missing")


# ==========================================
# 2. GEMINI CLIENT CONFIGURATION
# ==========================================

client = genai.Client(api_key=API_KEY)

MODEL = "gemini-3.5-flash-lite"


# ==========================================
# 3. SYSTEM PROMPT
# ==========================================

SYSTEM_PROMPT = """
You are Infinity B AI, a helpful personal AI assistant.

Rules:
1. Give clear and accurate answers.
2. Use simple English.
3. Explain difficult topics step by step.
4. Give examples wherever useful.
5. Be friendly and professional.
6. Never invent facts.
"""


# ==========================================
# 4. FASTAPI APPLICATION
# ==========================================

app = FastAPI(
    title="Infinity B AI API",
    description="Backend API for Infinity B AI chatbot",
    version="1.0.0"
)


# ==========================================
# 5. CORS CONFIGURATION
# ==========================================

frontend_url = os.getenv("FRONTEND_URL", "").strip()

allowed_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
]

if frontend_url:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# 6. CHAT REQUEST MODEL
# ==========================================

class ChatRequest(BaseModel):
    message: str
    previous_interaction_id: str | None = None


# ==========================================
# 7. HOME ROUTE
# ==========================================

@app.get("/")
def home():
    return {
        "message": "Infinity B AI Backend is running!",
        "status": "success"
    }


# ==========================================
# 8. HEALTH CHECK
# ==========================================

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "message": "Infinity B AI Backend is healthy"
    }


# ==========================================
# 9. CHAT API
# ==========================================

@app.post("/chat")
def chat(request: ChatRequest):

    if not request.message.strip():
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty"
        )

    try:
        args = {
            "model": MODEL,
            "system_instruction": SYSTEM_PROMPT,
            "input": request.message
        }

        if request.previous_interaction_id:
            args["previous_interaction_id"] = (
                request.previous_interaction_id
            )

        interaction = client.interactions.create(**args)

        reply = interaction.output_text

        if not reply:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned an empty response"
            )

        return {
            "reply": reply,
            "interaction_id": interaction.id
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Gemini API Error:", str(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to generate response. Please try again."
        )
