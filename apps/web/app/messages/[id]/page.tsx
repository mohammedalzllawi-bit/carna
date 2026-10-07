'use client';

import { useParams } from 'next/navigation';
import { ArrowRight, Mic, Send, Square, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

type Message = { id: string; senderId: string; body: string; audioUrl?: string | null; audioDurationSeconds?: number | null };
type Conversation = { currentUserId: string; vehicle: { make: string; model: string; year: number }; messages: Message[] };

export default function MessagePage() {
  const { id } = useParams<{ id: string }>();
  const [chat, setChat] = useState<Conversation | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const cancelled = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/platform/listing-chats/${id}`);
    if (!response.ok) { setError(response.status === 401 ? 'سجّل الدخول لعرض المحادثة' : 'تعذر تحميل المحادثة'); return; }
    setChat(await response.json() as Conversation);
  }, [id]);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10000);
    return () => {
      window.clearInterval(refresh);
      if (timer.current) clearInterval(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [load]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true); setError('');
    try {
      const response = await fetch(`/api/platform/listing-chats/${id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: body.trim() }) });
      if (!response.ok) throw new Error('تعذر إرسال الرسالة');
      setBody(''); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إرسال الرسالة'); }
    finally { setSending(false); }
  }

  async function startRecording() {
    if (sending || recorder.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('تسجيل الصوت غير متاح في هذا المتصفح أو الاتصال.'); return; }
    try {
      const source = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) { source.getTracks().forEach((track) => track.stop()); throw new Error('صيغة التسجيل غير مدعومة.'); }
      const media = new MediaRecorder(source, { mimeType });
      const chunks: BlobPart[] = [];
      media.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
      media.addEventListener('stop', () => {
        source.getTracks().forEach((track) => track.stop());
        stream.current = null; recorder.current = null; setRecording(false); setRecordingSeconds(0);
        if (cancelled.current || !chunks.length) return;
        const type = mimeType.split(';')[0];
        const extension = type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : 'webm';
        const data = new FormData();
        data.append('audio', new Blob(chunks, { type }), `message.${extension}`);
        setSending(true);
        void fetch(`/api/platform/listing-chats/${id}/voice`, { method: 'POST', body: data })
          .then(async (response) => { if (!response.ok) throw new Error('تعذر إرسال الصوت'); await load(); })
          .catch((caught) => setError(caught instanceof Error ? caught.message : 'تعذر إرسال الصوت'))
          .finally(() => setSending(false));
      });
      cancelled.current = false;
      stream.current = source; recorder.current = media; startedAt.current = Date.now();
      media.start(); setError(''); setRecording(true); setRecordingSeconds(0);
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
        setRecordingSeconds(Math.min(60, elapsed));
        if (elapsed >= 60) stopRecording();
      }, 250);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر استخدام الميكروفون'); }
  }

  function stopRecording(cancel = false) {
    if (timer.current) clearInterval(timer.current);
    timer.current = null; cancelled.current = cancel;
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  return <main className="chat-page" dir="rtl">
    <a href="/account"><ArrowRight size={17} /> حسابي</a>
    <h1>{chat ? `${chat.vehicle.make} ${chat.vehicle.model} · ${chat.vehicle.year}` : 'المحادثة'}</h1>
    {error && <p role="alert" className="detail-error">{error}</p>}
    <div className="chat-messages">{chat?.messages.map((message) => <div key={message.id} className={message.senderId === chat.currentUserId ? 'mine' : ''}>
      {message.audioUrl ? <audio controls preload="none" src={message.audioUrl} aria-label={`رسالة صوتية ${message.audioDurationSeconds ?? ''} ثانية`} /> : message.body}
    </div>)}</div>
    <form onSubmit={send}>{recording ? <>
      <button type="button" onClick={() => stopRecording(true)} title="إلغاء التسجيل" aria-label="إلغاء التسجيل"><X size={20} /></button>
      <span aria-live="polite">تسجيل {recordingSeconds} / 60 ث</span>
      <button type="button" onClick={() => stopRecording()} title="إرسال الصوت" aria-label="إرسال الصوت"><Square size={20} /></button>
    </> : <>
      <input aria-label="الرسالة" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder="اكتب رسالة..." />
      <button type="button" onClick={() => void startRecording()} disabled={sending} title="تسجيل صوت" aria-label="تسجيل صوت"><Mic size={20} /></button>
      <button type="submit" disabled={sending || !body.trim()} title="إرسال" aria-label="إرسال"><Send size={20} /></button>
    </>}</form>
  </main>;
}
