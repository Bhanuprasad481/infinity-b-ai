
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

// Production backend URL
// Vercel environment variable takes priority.
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://infinity-b-ai.onrender.com"
).replace(/\/+$/, "");

function getSavedChats() {
  try {
    const saved = JSON.parse(localStorage.getItem("bhanu-ai-chats"));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function App() {
  const [chats, setChats] = useState(getSavedChats);

  const [activeChatId, setActiveChatId] = useState(() => {
    const saved = getSavedChats();
    return saved[0]?.id || null;
  });

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef(null);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("bhanu-ai-theme") || "dark";
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("checking");

  const currentChat = chats.find(
    (chat) => chat.id === activeChatId
  );

  const messages = currentChat?.messages || [];

  const filteredChats = chats.filter((chat) =>
    (chat.title || "")
      .toLowerCase()
      .includes(chatSearch.trim().toLowerCase())
  );

  useEffect(() => {
    localStorage.setItem("bhanu-ai-chats", JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem("bhanu-ai-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Check backend connection every 10 seconds
  useEffect(() => {
    let isMounted = true;

    const checkBackend = async () => {
      const controller = new AbortController();

      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, 5000);

      try {
        const response = await fetch(`${API_BASE_URL}/`, {
          method: "GET",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Backend unavailable");
        }

        if (isMounted) {
          setConnectionStatus("connected");
        }
      } catch (error) {
        if (isMounted) {
          setConnectionStatus("disconnected");
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    checkBackend();

    const intervalId = window.setInterval(
      checkBackend,
      10000
    );

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // Copy AI response
  const handleCopy = async (content, messageId) => {
    try {
      await navigator.clipboard.writeText(content);

      setCopiedMessageId(messageId);

      window.setTimeout(() => {
        setCopiedMessageId((current) =>
          current === messageId ? null : current
        );
      }, 2000);
    } catch (error) {
      console.error("Copy failed:", error);
      alert("Unable to copy. Please try again.");
    }
  };

  // Export current chat as TXT
  const handleExportChat = () => {
    if (!currentChat || !currentChat.messages?.length) {
      return;
    }

    const exportDate = new Date().toLocaleString();

    const content = [
      "INFINITY B AI - CHAT EXPORT",
      `Chat Title: ${currentChat.title}`,
      `Exported: ${exportDate}`,
      "========================================",
      "",
      ...currentChat.messages.map((item) => {
        const role = item.role === "user" ? "YOU" : "INFINITY B AI";
        return `${role}:\n${item.content}\n`;
      }),
    ].join("\n");

    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const safeTitle = (currentChat.title || "Infinity-B-AI-Chat")
      .replace(/[^a-z0-9-_]/gi, "_")
      .slice(0, 35);

    link.href = url;
    link.download = `${safeTitle}.txt`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // Send request to Gemini backend
  const requestGemini = async (userMessage, previousId, signal) => {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: userMessage,
        previous_interaction_id: previousId,
      }),
      signal,
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("Invalid response from server");
    }

    if (!response.ok) {
      throw new Error(
        data.detail || `Server error: ${response.status}`
      );
    }

    return data;
  };

  // Stop AI response generation
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  // Create new chat
  const handleNewChat = () => {
    setActiveChatId(null);
    setMessage("");
    setSidebarOpen(false);
    setCopiedMessageId(null);
  };

  // Delete chat
  const handleDeleteChat = (chatId) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this conversation?"
    );

    if (!confirmDelete) return;

    setChats((prevChats) =>
      prevChats.filter((chat) => chat.id !== chatId)
    );

    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessage("");
      setCopiedMessageId(null);
    }
  };

  // Send new message
  const handleSend = async (e) => {
    e.preventDefault();

    const userMessage = message.trim();

    if (!userMessage || loading) return;

    const chatId = activeChatId || crypto.randomUUID();
    const previousId = currentChat?.previousId || null;

    const newChat = {
      id: chatId,
      title: userMessage.slice(0, 35),
      messages: [],
      previousId: null,
    };

    setChats((prev) => {
      const existing = prev.find((chat) => chat.id === chatId);

      if (existing) {
        return prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  {
                    role: "user",
                    content: userMessage,
                    previousInteractionId: previousId,
                  },
                ],
              }
            : chat
        );
      }

      return [
        {
          ...newChat,
          messages: [
            {
              role: "user",
              content: userMessage,
              previousInteractionId: previousId,
            },
          ],
        },
        ...prev,
      ];
    });

    setActiveChatId(chatId);
    setMessage("");
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const data = await requestGemini(
        userMessage,
        previousId,
        controller.signal
      );

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                previousId: data.interaction_id,
                messages: [
                  ...chat.messages,
                  {
                    role: "assistant",
                    content: data.reply,
                    interactionId: data.interaction_id,
                  },
                ],
              }
            : chat
        )
      );
    } catch (error) {
      if (error.name === "AbortError") {
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: [
                    ...chat.messages,
                    {
                      role: "assistant",
                      content: "Generation stopped.",
                      isError: true,
                    },
                  ],
                }
              : chat
          )
        );
      } else {
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: [
                    ...chat.messages,
                    {
                      role: "assistant",
                      content: "Error: " + error.message,
                      isError: true,
                    },
                  ],
                }
              : chat
          )
        );
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setLoading(false);
    }
  };

  // Regenerate latest AI response
  const handleRegenerate = async (assistantIndex) => {
    if (!activeChatId || loading) return;

    const chat = chats.find(
      (item) => item.id === activeChatId
    );

    if (!chat) return;

    const assistantMessage = chat.messages[assistantIndex];

    if (
      assistantMessage?.role !== "assistant" ||
      assistantIndex !== chat.messages.length - 1
    ) {
      return;
    }

    let userIndex = assistantIndex - 1;

    while (
      userIndex >= 0 &&
      chat.messages[userIndex].role !== "user"
    ) {
      userIndex--;
    }

    if (userIndex < 0) return;

    const originalQuestion = chat.messages[userIndex].content;

    const previousId =
      chat.messages[userIndex].previousInteractionId || null;

    setLoading(true);
    setCopiedMessageId(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const data = await requestGemini(
        originalQuestion,
        previousId,
        controller.signal
      );

      setChats((prev) =>
        prev.map((item) =>
          item.id === activeChatId
            ? {
                ...item,
                previousId: data.interaction_id,
                messages: item.messages.map((msg, index) =>
                  index === assistantIndex
                    ? {
                        ...msg,
                        content: data.reply,
                        interactionId: data.interaction_id,
                        isError: false,
                      }
                    : msg
                ),
              }
            : item
        )
      );
    } catch (error) {
      if (error.name !== "AbortError") {
        alert("Regenerate failed: " + error.message);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setLoading(false);
    }
  };

  // Open previous chat
  const openChat = (chatId) => {
    setActiveChatId(chatId);
    setMessage("");
    setSidebarOpen(false);
    setCopiedMessageId(null);
  };

  return (
    <div className={`app ${theme}`}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          className="mobile-sidebar-overlay"
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar ${sidebarOpen ? "mobile-open" : ""}`}
        aria-label="Chat history sidebar"
      >
        <div className="brand">
          <div className="brand-icon">✦</div>
          <h2>Infinity B AI</h2>

          <button
            className="mobile-close-button"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <button
          className="new-chat"
          type="button"
          onClick={handleNewChat}
        >
          + New Chat
        </button>

        {/* Chat History */}
        <div className="history">
          <p className="history-title">CHAT HISTORY</p>

          <div className="chat-search-wrapper">
            <input
              className="chat-search-input"
              type="search"
              placeholder="Search conversations..."
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              aria-label="Search conversations"
            />

            {chatSearch && (
              <button
                className="clear-search-button"
                type="button"
                onClick={() => setChatSearch("")}
                aria-label="Clear search"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="history-list">
            {chats.length === 0 && (
              <p className="empty-history">
                No conversations yet
              </p>
            )}

            {chats.length > 0 && filteredChats.length === 0 && (
              <p className="empty-history">
                No matching conversations found
              </p>
            )}

            {filteredChats.map((chat) => (
              <div className="history-entry" key={chat.id}>
                <button
                  className={`history-item ${
                    activeChatId === chat.id ? "active" : ""
                  }`}
                  type="button"
                  onClick={() => openChat(chat.id)}
                  title={chat.title}
                >
                  {chat.title}
                </button>

                <button
                  className="delete-chat"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteChat(chat.id);
                  }}
                  title="Delete chat"
                  aria-label={`Delete ${chat.title}`}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Profile */}
        <div className="profile">
          <div className="avatar">B</div>

          <div>
            <strong>Bhanu</strong>
            <p>Personal Account</p>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-heading">
            <button
              className="mobile-menu-button"
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open chat history"
              aria-expanded={sidebarOpen}
            >
              ☰
            </button>

            <h3>Infinity B AI</h3>
          </div>

          <div className="topbar-actions">
            <button
              className="theme-toggle"
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${
                theme === "dark" ? "light" : "dark"
              } mode`}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
            </button>

            {messages.length > 0 && (
              <button
                className="export-chat-button"
                type="button"
                onClick={handleExportChat}
                title="Download chat"
              >
                ↓ Export Chat
              </button>
            )}

            <span className={`status ${connectionStatus}`}>
              ●{" "}
              {connectionStatus === "connected"
                ? "Backend Connected"
                : connectionStatus === "disconnected"
                ? "Backend Disconnected"
                : "Checking Backend..."}
            </span>
          </div>
        </header>

        {/* Welcome Screen */}
        {messages.length === 0 && (
          <section className="welcome">
            <div className="welcome-icon">✦</div>

            <h1>How can I help you today?</h1>

            <p>
              Welcome to Infinity B AI.
              Your personal AI assistant.
              Ask anything and explore ideas.
            </p>

            <div className="suggestions">
              <button
                type="button"
                onClick={() =>
                  setMessage("Explain Python programming")
                }
              >
                Explain Python
              </button>

              <button
                type="button"
                onClick={() =>
                  setMessage("Help me prepare for interviews")
                }
              >
                Interview Preparation
              </button>

              <button
                type="button"
                onClick={() =>
                  setMessage("Give me SQL practice questions")
                }
              >
                SQL Practice
              </button>

              <button
                type="button"
                onClick={() =>
                  setMessage("Explain Artificial Intelligence")
                }
              >
                Learn AI
              </button>
            </div>
          </section>
        )}

        {/* Conversation Messages */}
        {messages.length > 0 && (
          <section className="chat-messages">
            {messages.map((item, index) => {
              const messageId = `${activeChatId}-${index}`;

              const isLatestAssistant =
                item.role === "assistant" &&
                index === messages.length - 1 &&
                !item.isError;

              return (
                <div
                  key={messageId}
                  className={`message-row ${item.role}`}
                >
                  <div className="message-avatar">
                    {item.role === "user" ? "B" : "✦"}
                  </div>

                  <div className="message-content">
                    <strong>
                      {item.role === "user" ? "You" : "Infinity B AI"}
                    </strong>

                    <div className="markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                      >
                        {item.content}
                      </ReactMarkdown>
                    </div>

                    {item.role === "assistant" && (
                      <div className="response-actions">
                        <button
                          className="copy-response-button"
                          type="button"
                          onClick={() =>
                            handleCopy(item.content, messageId)
                          }
                          title="Copy response"
                          aria-label="Copy AI response"
                        >
                          {copiedMessageId === messageId ? (
                            <>
                              <span>✓</span> Copied!
                            </>
                          ) : (
                            <>
                              <span>▢</span> Copy
                            </>
                          )}
                        </button>

                        {isLatestAssistant && (
                          <button
                            className="regenerate-button"
                            type="button"
                            onClick={() =>
                              handleRegenerate(index)
                            }
                            disabled={loading}
                            title="Regenerate response"
                            aria-label="Regenerate AI response"
                          >
                            <span>↻</span> Regenerate
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="message-row assistant">
                <div className="message-avatar">✦</div>

                <div className="message-content">
                  <strong>Infinity B AI</strong>
                  <p className="typing">Thinking...</p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Message Input */}
        <div className="chat-input-area">
          <form className="input-box" onSubmit={handleSend}>
            <textarea
              placeholder="Message Infinity B AI..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows="1"
              disabled={loading}
            />

            {loading ? (
              <button
                className="stop-button"
                type="button"
                onClick={handleStop}
                aria-label="Stop generating"
                title="Stop generating"
              >
                ■ Stop
              </button>
            ) : (
              <button
                className="send-button"
                type="submit"
                disabled={!message.trim()}
                aria-label="Send message"
              >
                ↑
              </button>
            )}
          </form>

          <p className="disclaimer">
            Infinity B AI can make mistakes.
            Verify important information.
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
