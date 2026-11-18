
import os
import streamlit as st
from dotenv import load_dotenv
from google import genai

# 1. Load API key
load_dotenv("prompt.env", override=True)

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    st.error("Gemini API key not found!")
    st.stop()

# 2. Connect Gemini
client = genai.Client(api_key=api_key)

# Use the exact model that worked in your Jupyter test
MODEL = "gemini-3.5-flash-lite"

# 3. System prompt
system_prompt = """
You are a helpful AI assistant.

Your responsibilities:
1. Answer questions clearly.
2. Use simple English.
3. Explain concepts with examples.
4. Provide step-by-step explanations.
5. Maintain a friendly and professional tone.
6. If unsure, acknowledge it.
7. Never invent facts.
8. Ask for clarification when necessary.
"""

# 4. Page configuration
st.set_page_config(
    page_title="Bhanu AI Chatbot",
    page_icon="🤖"
)

st.title("🤖 Bhanu's AI Chatbot")
st.caption("Powered by Google Gemini")

# 5. Initialize session state
if "messages" not in st.session_state:
    st.session_state.messages = []

if "previous_id" not in st.session_state:
    st.session_state.previous_id = None

# 6. Clear chat
if st.button("Clear Chat"):
    st.session_state.messages = []
    st.session_state.previous_id = None
    st.rerun()

# 7. Display chat history
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# 8. User input
user_input = st.chat_input("Ask me anything...")

if user_input:

    st.session_state.messages.append({
        "role": "user",
        "content": user_input
    })

    with st.chat_message("user"):
        st.markdown(user_input)

    with st.chat_message("assistant"):

        with st.spinner("Gemini is thinking..."):

            try:

                interaction = client.interactions.create(
                    model=MODEL,
                    system_instruction=system_prompt,
                    input=user_input,
                    previous_interaction_id=
                        st.session_state.previous_id,
                    timeout=120
                )

                answer = interaction.output_text

                st.session_state.previous_id = interaction.id

                st.markdown(answer)

                st.session_state.messages.append({
                    "role": "assistant",
                    "content": answer
                })

            except Exception as e:
                st.error(f"Something went wrong: {e}")
