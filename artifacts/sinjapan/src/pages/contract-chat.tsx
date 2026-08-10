import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';
import {
  ArrowLeft, AlertTriangle, Car, Wrench, ShieldAlert,
  HelpCircle, Phone, ChevronDown, ChevronUp, Loader2,
  Camera, X, Upload, CheckCircle2, ChevronRight,
} from 'lucide-react';

const BASE = `${import.meta.env.BASE_URL}api`;
const API  = (p: string) => `${BASE}${p}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';
const hdrs  = () => ({ Authorization: `Bearer ${token()}` });

/* ── 写真アップロード ─────────────────────────────────── */
async function uploadPhoto(file: File): Promise<string> {
  const r = await fetch(API('/storage/user-uploads/request-url'), {
    method: 'POST',
    headers: { ...hdrs(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  const { uploadURL, objectPath } = await r.json();
  await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  return objectPath as string;
}

/* ── カテゴリ定義 ─────────────────────────────────────── */
const CATEGORIES = [
  { id: 'accident',  icon: Car,         label: '交通事故',     color: 'bg-red-50 border-red-300 text-red-700',         desc: '衝突・接触事故が発生した場合' },
  { id: 'breakdown', icon: Wrench,      label: '車両故障',     color: 'bg-orange-50 border-orange-300 text-orange-700', desc: 'エンジン不動・パンクなど' },
  { id: 'theft',     icon: ShieldAlert, label: '盗難・不正使用', color: 'bg-purple-50 border-purple-300 text-purple-700', desc: '車両の盗難・無断使用' },
  { id: 'other',     icon: HelpCircle,  label: 'その他トラブル', color: 'bg-muted border-border text-foreground',         desc: '上記に当てはまらない場合' },
] as const;
type CategoryId = (typeof CATEGORIES)[number]['id'];

/* ── フォームフィールド定義 ──────────────────────────── */
interface Field { id: string; label: string; type: 'text' | 'textarea' | 'select' | 'radio'; options?: string[]; required?: boolean; }

const FIELDS: Record<CategoryId, Field[]> = {
  accident: [
    { id: 'datetime', label: '発生日時',   type: 'text',     required: true },
    { id: 'location', label: '発生場所',   type: 'text',     required: true },
    { id: 'other_party', label: '相手方情報（車種・ナンバー等）', type: 'text' },
    { id: 'injured',  label: '負傷者',     type: 'radio',    options: ['あり', 'なし'], required: true },
    { id: 'police',   label: '警察への連絡', type: 'radio',   options: ['済み', '未対応'] },
    { id: 'detail',   label: '状況の詳細', type: 'textarea', required: true },
  ],
  breakdown: [
    { id: 'symptom',  label: '症状',       type: 'select',   options: ['エンジン不動', 'パンク・タイヤ破損', 'バッテリー上がり', 'オーバーヒート', 'ブレーキ異常', 'その他'], required: true },
    { id: 'drivable', label: '走行可能',   type: 'radio',    options: ['可能', '不可能'], required: true },
    { id: 'location', label: '現在地',     type: 'text',     required: true },
    { id: 'detail',   label: '詳しい状況', type: 'textarea', required: true },
  ],
  theft: [
    { id: 'datetime', label: '発見日時',           type: 'text',     required: true },
    { id: 'last_seen', label: '最後に確認した場所', type: 'text',     required: true },
    { id: 'police',   label: '警察への届出',       type: 'radio',    options: ['済み', '未対応'] },
    { id: 'detail',   label: '状況の詳細',         type: 'textarea', required: true },
  ],
  other: [
    { id: 'summary',  label: 'トラブルの概要', type: 'text',     required: true },
    { id: 'detail',   label: '詳しい状況',    type: 'textarea', required: true },
  ],
};

const ROLE_LABELS: Record<string, string> = {
  user: 'あなた', rental_company: '担当者', admin: '担当者',
};

/* ── 報告フォームシート ──────────────────────────────── */
function ReportSheet({
  category, contractId, onClose, onSent,
}: {
  category: CategoryId; contractId: number;
  onClose: () => void; onSent: () => void;
}) {
  const cat = CATEGORIES.find(c => c.id === category)!;
  const Icon = cat.icon;
  const fields = FIELDS[category];

  const [values, setValues] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<{ file: File; preview: string; path?: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (id: string, v: string) => setValues(prev => ({ ...prev, [id]: v }));

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).slice(0, 5 - photos.length).forEach(file => {
      setPhotos(prev => [...prev, { file, preview: URL.createObjectURL(file) }]);
    });
  };

  const removePhoto = (i: number) => setPhotos(prev => prev.filter((_, j) => j !== i));

  const handleSubmit = async () => {
    const required = fields.filter(f => f.required);
    if (required.some(f => !values[f.id]?.trim())) return alert('必須項目を入力してください');
    setSending(true);
    setUploading(true);
    try {
      // 写真アップロード
      const uploadedPaths: string[] = [];
      for (const p of photos) {
        const path = await uploadPhoto(p.file);
        uploadedPaths.push(path);
      }
      setUploading(false);

      // メッセージ組み立て
      const lines = [`【${cat.label}】`];
      for (const f of fields) {
        const v = values[f.id];
        if (v) lines.push(`▶ ${f.label}：${v}`);
      }
      if (uploadedPaths.length > 0) {
        lines.push(`▶ 添付写真：${uploadedPaths.length}枚`);
        lines.push(uploadedPaths.join('\n'));
      }

      const r = await fetch(API(`/contract-chat/${contractId}`), {
        method: 'POST',
        headers: { ...hdrs(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lines.join('\n') }),
      });
      if (r.ok) { setDone(true); setTimeout(() => { onSent(); onClose(); }, 1800); }
    } finally { setSending(false); }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
        <div className="w-full bg-card rounded-t-2xl p-8 flex flex-col items-center gap-4">
          <CheckCircle2 className="h-12 w-12 text-foreground" />
          <p className="font-bold text-lg">報告を送信しました</p>
          <p className="text-sm text-muted-foreground">担当者より折り返しご連絡します</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        className="w-full bg-card rounded-t-2xl max-h-[90dvh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* シートヘッダー */}
        <div className={`shrink-0 flex items-center justify-between px-5 py-4 rounded-t-2xl border-b border-border`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${cat.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold">{cat.label}</p>
              <p className="text-xs text-muted-foreground">{cat.desc}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* フォーム */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {fields.map(f => (
            <div key={f.id}>
              <label className="block text-sm font-medium mb-1.5">
                {f.label}{f.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {f.type === 'textarea' ? (
                <textarea
                  value={values[f.id] ?? ''}
                  onChange={e => set(f.id, e.target.value)}
                  rows={4}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-background resize-none"
                  placeholder="詳しく記入してください"
                />
              ) : f.type === 'select' ? (
                <select
                  value={values[f.id] ?? ''}
                  onChange={e => set(f.id, e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
                >
                  <option value="">選択してください</option>
                  {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === 'radio' ? (
                <div className="flex gap-2">
                  {f.options!.map(o => (
                    <button
                      key={o}
                      onClick={() => set(f.id, o)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${
                        values[f.id] === o
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-background border-border text-foreground hover:border-foreground/40'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="text"
                  value={values[f.id] ?? ''}
                  onChange={e => set(f.id, e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  placeholder={f.label}
                />
              )}
            </div>
          ))}

          {/* 写真アップロード */}
          <div>
            <label className="block text-sm font-medium mb-2">
              現場写真 <span className="text-muted-foreground font-normal">（最大5枚）</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                  <img src={p.preview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
              {photos.length < 5 && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-foreground/40 transition-colors"
                >
                  <Camera className="h-5 w-5" />
                  <span className="text-xs">追加</span>
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => addPhotos(e.target.files)}
            />
          </div>
        </div>

        {/* 送信ボタン */}
        <div className="shrink-0 px-5 py-4 border-t border-border">
          <button
            onClick={handleSubmit}
            disabled={sending}
            className="w-full py-3.5 bg-foreground text-background rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin" />{uploading ? '写真をアップロード中…' : '送信中…'}</>
              : <><Upload className="h-4 w-4" />報告を送信する</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── メインページ ─────────────────────────────────────── */
export default function ContractChat() {
  const { id } = useParams<{ id: string }>();
  const contractId = parseInt(id ?? '0');
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe();

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showEmergency, setShowEmergency] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval>>();

  const load = async () => {
    const r = await fetch(API(`/contract-chat/${contractId}`), { headers: hdrs() });
    if (r.ok) setMessages(await r.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 5000);
    return () => clearInterval(pollRef.current);
  }, [contractId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isMine = (msg: any) => msg.sender_id === me?.id;
  const backHref = me?.role === 'rental_company' || me?.role === 'admin' ? '/company/contracts' : '/mypage';

  return (
    <div className="flex flex-col h-[100dvh] bg-background">

      {/* ヘッダー */}
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => setLocation(backHref)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-100 border border-red-300 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="font-semibold text-sm">事故・トラブル報告</p>
              <p className="text-xs text-muted-foreground">担当者に直接連絡できます</p>
            </div>
          </div>
        </div>

        {/* 緊急連絡先（折り畳み可） */}
        <div className="border-t border-border">
          <button
            onClick={() => setShowEmergency(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Phone className="h-3.5 w-3.5 text-red-500" />緊急連絡先
            </span>
            {showEmergency ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showEmergency && (
            <div className="px-4 pb-3 grid grid-cols-2 gap-2 text-xs">
              <a href="tel:050-5526-9906" className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 hover:bg-red-100 transition-colors">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span><span className="font-semibold block">SIN JAPAN</span>050-5526-9906</span>
              </a>
              <a href="tel:110" className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg hover:bg-muted/80 transition-colors">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span><span className="font-semibold block">警察</span>110</span>
              </a>
              <a href="tel:119" className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg hover:bg-muted/80 transition-colors">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span><span className="font-semibold block">救急・消防</span>119</span>
              </a>
              <a href="tel:0120-079-919" className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg hover:bg-muted/80 transition-colors">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span><span className="font-semibold block">JAFロードサービス</span>0120-079-919</span>
              </a>
            </div>
          )}
        </div>
      </header>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center pt-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 pt-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="font-medium text-sm">まだ報告はありません</p>
            <p className="text-xs text-muted-foreground">下のカテゴリを選んで報告してください</p>
          </div>
        ) : (
          messages.map(msg => {
            const mine = isMine(msg);
            return (
              <div key={msg.id} className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                {!mine && (
                  <span className="text-xs font-medium text-muted-foreground px-1">
                    {ROLE_LABELS[msg.sender_role_actual] ?? '担当者'}
                  </span>
                )}
                <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  mine ? 'bg-foreground text-background rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm border border-border'
                }`}>
                  {msg.message}
                </div>
                <span className="text-xs text-muted-foreground/70 px-1">
                  {new Date(msg.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* カテゴリ選択ボタン */}
      <div className="shrink-0 border-t border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground mb-2 font-medium">報告カテゴリを選択</p>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-background hover:bg-muted transition-colors text-left"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${cat.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-medium">{cat.label}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </div>

      {/* 報告フォームシート */}
      {activeCategory && (
        <ReportSheet
          category={activeCategory}
          contractId={contractId}
          onClose={() => setActiveCategory(null)}
          onSent={load}
        />
      )}
    </div>
  );
}
