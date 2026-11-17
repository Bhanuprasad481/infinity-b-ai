
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

load_dotenv(PROJECT_DIR / "prompt.env")

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError(
        "GEMINI_API_KEY not found in project root prompt.env"
    )


# ==========================================
# 2. GEMINI CLIENT CONFIGURATION
# ==========================================

client = genai.Client(api_key=API_KEY)

MODEL = "gemini-3.5-flash-lite"


# ==========================================
# 3. SYSTEM PROMPT
# ==========================================

SYSTEM_PROMPT = """
You are Bhanu AI, a helpful personal AI assistant.

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
    title="Bhanu AI Chatbot API",
    description="Backend API for Bhanu AI",
    version="1.0.0"
)


# ==========================================
# 5. CORS CONFIGURATION
# ==========================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ],
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
        "message": "Bhanu AI Backend is running!",
        "status": "success"
    }


# ==========================================
# 8. CHAT API
# ==========================================

@app.post("/chat")
def chat(request: ChatRequest):

    # Validate empty messages
    if not request.message.strip():
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty"
        )

    try:
        # Gemini API request
        args = {
            "model": MODEL,
            "system_instruction": SYSTEM_PROMPT,
            "input": request.message
        }

        # Continue previous conversation if available
        if request.previous_interaction_id:
            args["previous_interaction_id"] = (
                request.previous_interaction_id
            )

        # Generate Gemini response
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

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Backend is running"}
