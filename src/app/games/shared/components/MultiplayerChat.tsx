"use client";

import { FormEvent, useLayoutEffect, useRef, useState } from "react";
import { Send, Users } from "lucide-react";
import Link from "next/link";
import type { MultiplayerLobby } from "@/lib/multiplayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function MultiplayerChat({ lobby, sendMessage }: { lobby?: MultiplayerLobby | null; sendMessage(message: string): boolean }) {
    const [message, setMessage] = useState("");
    const messagesRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);

    useLayoutEffect(() => {
        const container = messagesRef.current;
        if (container && stickToBottomRef.current) container.scrollTop = container.scrollHeight;
    }, [lobby?.messages.length]);

    if (!lobby) return null;

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const nextMessage = message.trim();
        if (!nextMessage || !sendMessage(nextMessage)) return;
        stickToBottomRef.current = true;
        setMessage("");
        requestAnimationFrame(() => {
            if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        });
    };

    return (
        <section className="flex max-h-44 flex-col rounded-lg border border-border/60 bg-card/70">
            <header className="border-b border-border/60 px-3 py-2 text-xs font-semibold">Lobby chat</header>
            <div
                ref={messagesRef}
                className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
                onScroll={(event) => {
                    const container = event.currentTarget;
                    stickToBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight <= 24;
                }}
            >
                {lobby.messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No messages yet.</p>
                ) : (
                    lobby.messages.map((item, index) => {
                        if (item.kind === "join" || item.kind === "leave" || item.kind === "system") {
                            return (
                                <div key={item.id} className={`${index === 0 ? "" : "mt-2"} flex items-center gap-2 text-xs text-muted-foreground`}>
                                    <Users className="size-3.5 shrink-0" />
                                    <span>
                                        {item.kind === "system" ? (
                                            item.message
                                        ) : (
                                            <>
                                                <Link
                                                    href={`/user/${item.userId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                                >
                                                    {item.username}
                                                </Link>{" "}
                                                {item.message}
                                            </>
                                        )}
                                    </span>
                                </div>
                            );
                        }

                        return (
                            <div key={item.id} className={`${index === 0 ? "" : "mt-2"} text-xs`}>
                                <Link
                                    href={`/user/${item.userId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                >
                                    {item.username}
                                </Link>
                                <span className="ml-2 break-words text-foreground/80">{item.message}</span>
                            </div>
                        );
                    })
                )}
            </div>
            <form className="flex gap-2 border-t border-border/60 p-2" onSubmit={handleSubmit}>
                <Input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={300} placeholder="Message lobby..." className="h-9" />
                <Button type="submit" size="icon" className="size-9 shrink-0" disabled={!message.trim()} aria-label="Send message">
                    <Send className="size-4" />
                </Button>
            </form>
        </section>
    );
}
