'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, MessageCircle } from 'lucide-react';

type Conversation = { id: string; vehicle: { make: string; model: string; year: number }; otherName?: string; lastMessage?: string | null };

export default function MessagesPage() {
  const [chats, setChats] = useState<Conversation[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/platform/listing-chats').then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? 'سجّل الدخول لعرض الرسائل' : 'تعذر تحميل الرسائل');
      return response.json() as Promise<Conversation[]>;
    }).then(setChats).catch((caught) => setError(caught.message));
  }, []);
  return <main className="chat-page" dir="rtl"><a href="/account"><ArrowRight size={17} /> حسابي</a><h1>الرسائل</h1>
    {error && <p className="detail-error" role="alert">{error} <a href="/auth">تسجيل الدخول</a></p>}
    {!error && !chats.length && <p>لا توجد محادثات بعد.</p>}
    <div className="message-list">{chats.map((chat) => <a key={chat.id} href={`/messages/${chat.id}`}><MessageCircle size={20} /><span><strong>{chat.vehicle.make} {chat.vehicle.model} · {chat.vehicle.year}</strong><small>{chat.otherName ?? ''} · {chat.lastMessage ?? 'محادثة جديدة'}</small></span></a>)}</div>
  </main>;
}
