import React, { useState, useEffect } from 'react';
import { MessageSquare, Mail, Clock, CheckCheck, Loader2, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('sinjapan_auth_token');
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
}

type Inquiry = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  replied: boolean;
  createdAt: string;
};

export default function AdminContacts() {
  const { toast } = useToast();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [replyBodies, setReplyBodies] = useState<Record<number, string>>({});
  const [replying, setReplying] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch('/api/admin/contacts')
      .then(d => setInquiries(d.contacts ?? []))
      .catch(() => setInquiries([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleReply = async (inquiry: Inquiry) => {
    const body = replyBodies[inquiry.id];
    if (!body?.trim()) { toast({ title: '返信内容を入力してください', variant: 'destructive' }); return; }
    setReplying(inquiry.id);
    try {
      await apiFetch(`/api/admin/contacts/${inquiry.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      toast({ title: '返信しました' });
      setReplyBodies(prev => ({ ...prev, [inquiry.id]: '' }));
      load();
    } catch {
      toast({ title: '返信に失敗しました', variant: 'destructive' });
    } finally {
      setReplying(null);
    }
  };

  const unreplied = inquiries.filter(i => !i.replied);
  const replied = inquiries.filter(i => i.replied);

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const InquiryCard = ({ inquiry }: { inquiry: Inquiry }) => {
    const isOpen = expanded === inquiry.id;
    return (
      <div className={`border rounded-xl overflow-hidden ${inquiry.replied ? 'border-border/50' : 'border-border'}`}>
        <button
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
          onClick={() => setExpanded(isOpen ? null : inquiry.id)}
        >
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              {inquiry.replied
                ? <CheckCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />
                : <Mail className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              }
              <span className="font-medium text-sm truncate">{inquiry.subject}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{inquiry.name}</span>
              <span>·</span>
              <span>{inquiry.email}</span>
              <span>·</span>
              <span>{format(new Date(inquiry.createdAt), 'yyyy/MM/dd HH:mm')}</span>
            </div>
          </div>
          {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>

        {isOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-border/50">
            <div className="pt-3 text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-3 mt-1">
              {inquiry.message}
            </div>

            {!inquiry.replied && (
              <div className="space-y-2">
                <Textarea
                  value={replyBodies[inquiry.id] ?? ''}
                  onChange={e => setReplyBodies(prev => ({ ...prev, [inquiry.id]: e.target.value }))}
                  placeholder="返信内容を入力してください"
                  className="resize-none min-h-[100px] text-sm"
                />
                <Button
                  size="sm"
                  disabled={replying === inquiry.id}
                  onClick={() => handleReply(inquiry)}
                  className="bg-black text-white hover:bg-black/90"
                >
                  {replying === inquiry.id
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />送信中…</>
                    : <><Send className="h-3.5 w-3.5 mr-1.5" />返信する</>
                  }
                </Button>
              </div>
            )}
            {inquiry.replied && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCheck className="h-3.5 w-3.5" />返信済み
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">お問い合わせ管理</h1>
          <p className="text-muted-foreground mt-1 text-sm">ユーザーからのお問い合わせを確認・返信します。</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="text-orange-500 font-medium">{unreplied.length} 件未返信</span>
          <span>/ 全 {inquiries.length} 件</span>
        </div>
      </div>

      {inquiries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground space-y-2">
          <MessageSquare className="h-10 w-10 opacity-30" />
          <p className="text-sm">お問い合わせはまだありません</p>
        </div>
      ) : (
        <div className="space-y-6">
          {unreplied.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-orange-600 flex items-center gap-1.5">
                <Mail className="h-4 w-4" />未返信 ({unreplied.length})
              </h2>
              {unreplied.map(i => <InquiryCard key={i.id} inquiry={i} />)}
            </div>
          )}
          {replied.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                <CheckCheck className="h-4 w-4" />返信済み ({replied.length})
              </h2>
              {replied.map(i => <InquiryCard key={i.id} inquiry={i} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
