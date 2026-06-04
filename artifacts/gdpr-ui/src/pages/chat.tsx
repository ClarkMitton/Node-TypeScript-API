import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOpenaiConversations,
  useGetOpenaiConversation,
  useCreateOpenaiConversation,
  useDeleteOpenaiConversation,
  useListScans,
  getListOpenaiConversationsQueryKey,
  getGetOpenaiConversationQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Plus, Trash2, MessageSquare, Send, Loader2, Bot, User } from "lucide-react";

interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export default function Chat() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const convId = params.id ? parseInt(params.id, 10) : null;

  const { data: conversations, isLoading: convsLoading } = useListOpenaiConversations();
  const { data: scans } = useListScans();
  const createConv = useCreateOpenaiConversation();
  const deleteConv = useDeleteOpenaiConversation();

  const { data: conversation, isLoading: convLoading } = useGetOpenaiConversation(
    convId ?? 0,
    { query: { enabled: !!convId, queryKey: getGetOpenaiConversationQueryKey(convId ?? 0) } },
  );

  const [input, setInput] = useState("");
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync messages from loaded conversation
  useEffect(() => {
    if (conversation?.messages) {
      setMessages(
        conversation.messages.map((m) => ({
          id: String(m.id),
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      );
    }
  }, [conversation?.messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleNewConversation() {
    createConv.mutate(
      { data: { title: "New Conversation" } },
      {
        onSuccess: (conv) => {
          qc.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
          setMessages([]);
          setLocation(`/chat/${conv.id}`);
        },
      },
    );
  }

  function handleDeleteConversation(id: number) {
    if (!confirm("Delete this conversation?")) return;
    deleteConv.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
          if (convId === id) {
            setLocation("/chat");
            setMessages([]);
          }
        },
      },
    );
  }

  async function sendMessage() {
    if (!input.trim() || !convId || isStreaming) return;

    const userContent = input.trim();
    setInput("");

    const userMsg: StreamMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: userContent,
    };
    const assistantMsg: StreamMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/openai/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: userContent,
          scanId: selectedScanId ?? null,
          documentIds: [],
        }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { content?: string; error?: string };
            if (parsed.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + parsed.content! }
                    : m,
                ),
              );
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `Error: ${String(err)}`, streaming: false }
            : m,
        ),
      );
    } finally {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, streaming: false } : m,
        ),
      );
      setIsStreaming(false);
      // Refresh conversation messages
      qc.invalidateQueries({ queryKey: getGetOpenaiConversationQueryKey(convId) });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div className="flex h-screen">
      {/* Conversation sidebar */}
      <aside className="w-52 shrink-0 border-r border-[#21262d] flex flex-col bg-[#0d1117]">
        <div className="p-3 border-b border-[#21262d]">
          <Button
            onClick={handleNewConversation}
            disabled={createConv.isPending}
            size="sm"
            className="w-full bg-[#1f6feb] hover:bg-[#388bfd] text-white text-xs h-8"
          >
            {createConv.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Plus className="h-3 w-3 mr-1" />
            )}
            New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-auto py-2">
          {convsLoading ? (
            <div className="space-y-1 px-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 bg-[#161b22]" />
              ))}
            </div>
          ) : conversations && conversations.length > 0 ? (
            conversations.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center justify-between px-3 py-2 mx-1 rounded-md cursor-pointer transition-colors",
                  c.id === convId
                    ? "bg-[#161b22] text-[#c9d1d9]"
                    : "text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]",
                )}
                onClick={() => {
                  setMessages([]);
                  setLocation(`/chat/${c.id}`);
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="h-3 w-3 shrink-0" />
                  <span className="text-xs truncate">{c.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConversation(c.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-[#484f58] hover:text-[#f97583] transition-all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          ) : (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-[#484f58]">No conversations yet</p>
            </div>
          )}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!convId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-10 w-10 text-[#30363d] mx-auto mb-3" />
              <p className="text-sm text-[#8b949e]">Select a conversation or start a new one</p>
              <Button
                onClick={handleNewConversation}
                size="sm"
                className="mt-4 bg-[#1f6feb] hover:bg-[#388bfd] text-white"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Conversation
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Scan context selector */}
            {scans && scans.length > 0 && (
              <div className="border-b border-[#21262d] px-4 py-2 flex items-center gap-2">
                <span className="text-xs text-[#484f58]">Context:</span>
                <select
                  value={selectedScanId ?? ""}
                  onChange={(e) =>
                    setSelectedScanId(e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  className="text-xs bg-[#161b22] border border-[#30363d] text-[#c9d1d9] rounded px-2 py-1 focus:outline-none focus:border-[#58a6ff]"
                >
                  <option value="">No scan selected</option>
                  {scans
                    .filter((s) => s.status === "done")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.repoName} (score: {s.gdprScore})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
              {convLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 bg-[#161b22]" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Bot className="h-8 w-8 text-[#30363d] mx-auto mb-2" />
                    <p className="text-sm text-[#8b949e]">
                      Ask anything about GDPR compliance or scan findings
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-3",
                      msg.role === "user" ? "flex-row-reverse" : "flex-row",
                    )}
                  >
                    <div
                      className={cn(
                        "shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                        msg.role === "user"
                          ? "bg-[#1f6feb]"
                          : "bg-[#21262d]",
                      )}
                    >
                      {msg.role === "user" ? (
                        <User className="h-3 w-3 text-white" />
                      ) : (
                        <Bot className="h-3 w-3 text-[#58a6ff]" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2.5 text-sm leading-relaxed",
                        msg.role === "user"
                          ? "bg-[#1f6feb]/20 text-[#c9d1d9]"
                          : "bg-[#161b22] border border-[#21262d] text-[#c9d1d9]",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.streaming && (
                        <span className="inline-block w-1 h-4 bg-[#58a6ff] animate-pulse ml-0.5 align-middle" />
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[#21262d] px-4 py-3">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming}
                  placeholder="Ask about GDPR compliance, findings, or remediation…"
                  rows={1}
                  className="flex-1 resize-none bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#c9d1d9] placeholder:text-[#484f58] focus:outline-none focus:border-[#58a6ff] min-h-[38px] max-h-32 overflow-y-auto"
                  style={{ height: "auto" }}
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = "auto";
                    t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
                  }}
                />
                <Button
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || isStreaming}
                  className="bg-[#1f6feb] hover:bg-[#388bfd] text-white h-9 w-9 p-0 shrink-0"
                >
                  {isStreaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-[#484f58] mt-1.5">
                Enter to send, Shift+Enter for new line
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
