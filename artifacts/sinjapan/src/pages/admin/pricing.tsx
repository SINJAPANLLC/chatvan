import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Save, RotateCcw, Info, Bot, MessageCircle,
  FileText, Mail, Search, CheckCircle2, AlertCircle, Shield
} from 'lucide-react';

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('sinjapan_auth_token');
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
}

// ── プロンプト定義 ─────────────────────────────────────────────────────────────
type PromptSection = {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  badge: string;
  badgeColor: string;
  placeholders?: { token: string; desc: string }[];
};

const PROMPT_SECTIONS: PromptSection[] = [
  {
    key: 'ai_system_prompt',
    label: 'VANチャット',
    description: 'ユーザーが相談チャットを開始した際のAIシステムプロンプト。ヒアリング項目・会話ルール・完了タグの出力形式を定義します。',
    icon: MessageCircle,
    badge: 'チャット',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    key: 'ai_ekyc_prompt',
    label: 'eKYC — 本人確認AI判定',
    description: '運転免許証・顔写真をAIが審査する際のシステムプロンプト。判定基準・出力JSONフォーマットを定義します。',
    icon: Shield,
    badge: 'eKYC',
    badgeColor: 'bg-sky-100 text-sky-700',
  },
  {
    key: 'ai_screening_prompt',
    label: 'AI自動審査',
    description: 'eKYC通過後に申込内容をAIが審査するプロンプト。承認・却下の判断基準と審査方針を定義します。',
    icon: CheckCircle2,
    badge: '自動審査',
    badgeColor: 'bg-teal-100 text-teal-700',
  },
  {
    key: 'ai_blog_user_prompt',
    label: 'ブログ自動生成 — ユーザー向け',
    description: '軽バン利用者向けブログ記事の自動生成時に使うシステムプロンプト。記事の方向性・読者像・CTAの基本方針を記述します。',
    icon: FileText,
    badge: 'ブログ・ユーザー',
    badgeColor: 'bg-violet-100 text-violet-700',
  },
  {
    key: 'ai_blog_rental_prompt',
    label: 'ブログ自動生成 — レンタル会社向け',
    description: 'レンタル会社向けブログ記事の自動生成時に使うシステムプロンプト。稼働率・収益改善の視点から記事方針を記述します。',
    icon: FileText,
    badge: 'ブログ・レンタル会社',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    key: 'ai_prospect_score_prompt',
    label: '自動クロール — 企業スコアリング',
    description: 'DuckDuckGo / Braveで収集した企業をAIが評価・絞り込む際のプロンプト。パートナー候補の選定基準を記述します。',
    icon: Search,
    badge: '自動クロール',
    badgeColor: 'bg-green-100 text-green-700',
    placeholders: [
      { token: '{CANDIDATES}', desc: '収集した企業リスト（JSON）が自動挿入されます' },
      { token: '{INDUSTRY}', desc: '対象業種が自動挿入されます' },
    ],
  },
  {
    key: 'ai_prospect_email_prompt',
    label: '自動クロール — 営業メール生成',
    description: '自動クロールで収集した企業への個別営業メールを生成するプロンプト。メールの件名・本文の条件を記述します。',
    icon: Mail,
    badge: '自動クロール',
    badgeColor: 'bg-green-100 text-green-700',
    placeholders: [
      { token: '{COMPANY_NAME}', desc: '宛先企業名が自動挿入されます' },
      { token: '{INDUSTRY}', desc: '業種が自動挿入されます' },
    ],
  },
];

// ── 車両マッチングルール可視化 ──────────────────────────────────────────────────
const MATCHING_RULES = [
  { score: '+30点', label: 'エリア一致', desc: '車両の都道府県とユーザー希望エリアが一致', color: 'bg-blue-50 border-blue-200 text-blue-800' },
  { score: '+25点', label: '予算内', desc: '月額合計（車両代＋手数料＋保険）が予算の110%以内', color: 'bg-green-50 border-green-200 text-green-800' },
  { score: '+20点', label: '利用期間クリア', desc: 'ユーザーの希望期間が車両の最低利用期間以上', color: 'bg-violet-50 border-violet-200 text-violet-800' },
  { score: '+コスパ加点', label: '価格が予算に近い', desc: '予算内で最もコスパが高い車両に追加点数', color: 'bg-amber-50 border-amber-200 text-amber-800' },
  { score: 'TOP3', label: '上位3件を提案候補', desc: '合計スコアが高い車両から最大3件を管理者に提示', color: 'bg-gray-50 border-gray-200 text-gray-700' },
];

const FLOW_STEPS = [
  { icon: MessageCircle, label: 'チャット\nヒアリング', desc: '5項目収集', color: '#3b82f6', bg: '#eff6ff' },
  { icon: Search,        label: '車両\nマッチング', desc: 'スコアリング', color: '#8b5cf6', bg: '#f5f3ff' },
  { icon: Shield,        label: 'eKYC\n本人確認',   desc: 'AI画像判定',  color: '#0ea5e9', bg: '#f0f9ff' },
  { icon: CheckCircle2,  label: 'AI\n自動審査',     desc: '申込スクリーニング', color: '#14b8a6', bg: '#f0fdfa' },
  { icon: FileText,      label: '契約書\n自動生成',  desc: '電子署名へ',  color: '#10b981', bg: '#f0fdf4' },
];

function AIFlowVisualizer() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4" />AI処理フロー
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">チャット開始から契約書生成までの自動処理パイプライン</p>
      </div>
      <div className="p-5">
        {/* フロー図 */}
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {FLOW_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <React.Fragment key={i}>
                <div className="flex flex-col items-center gap-2 min-w-[100px]">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border"
                    style={{ background: step.bg, borderColor: step.color + '40' }}>
                    <Icon className="h-6 w-6" style={{ color: step.color }} />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold whitespace-pre-line leading-tight">{step.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{step.desc}</div>
                  </div>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div className="flex-1 min-w-[20px] flex items-center justify-center pb-6">
                    <div className="h-px w-full border-t-2 border-dashed border-border" />
                    <div className="text-muted-foreground/50 text-xs shrink-0 px-1">→</div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* 車両マッチングルール */}
        <div className="mt-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />車両マッチング スコアリングルール
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {MATCHING_RULES.map((r, i) => (
              <div key={i} className={`rounded-xl border px-4 py-3 ${r.color}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-bold">{r.score}</span>
                  <span className="text-xs font-semibold">{r.label}</span>
                </div>
                <p className="text-xs opacity-80 leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
            ※ 車両マッチングはルールベース（AIプロンプト非依存）です。スコアリングロジックを変更する場合はエンジニアに相談してください。
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 個別プロンプトエディタ ─────────────────────────────────────────────────────
type PromptData = { value: string; isCustomized: boolean };

function PromptEditor({
  section,
  data,
  onSaved,
}: {
  section: PromptSection;
  data: PromptData;
  onSaved: (key: string, value: string, isCustomized: boolean) => void;
}) {
  const { toast } = useToast();
  const Icon = section.icon;
  const [value, setValue] = useState(data.value);
  const [original, setOriginal] = useState(data.value);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [isCustomized, setIsCustomized] = useState(data.isCustomized);

  const isDirty = value !== original;

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/ai-prompts/${section.key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      setOriginal(value);
      setIsCustomized(true);
      onSaved(section.key, value, true);
      toast({ title: `${section.label}のプロンプトを保存しました` });
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!confirm('デフォルトプロンプトに戻しますか？カスタマイズした内容は失われます。')) return;
    setResetting(true);
    try {
      const r = await apiFetch(`/api/admin/ai-prompts/${section.key}`, { method: 'DELETE' });
      setValue(r.defaultValue);
      setOriginal(r.defaultValue);
      setIsCustomized(false);
      onSaved(section.key, r.defaultValue, false);
      toast({ title: 'デフォルトに戻しました' });
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    } finally { setResetting(false); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* ヘッダー */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-muted/20">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-background border border-border mt-0.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">{section.label}</h3>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${section.badgeColor}`}>
                {section.badge}
              </span>
              {isCustomized ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle2 className="h-3 w-3" />カスタム
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">デフォルト</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-lg leading-relaxed">{section.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {isCustomized && (
            <Button variant="outline" size="sm" onClick={handleReset} disabled={resetting} className="gap-1 text-xs">
              {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              デフォルトに戻す
            </Button>
          )}
          {isDirty && (
            <Button variant="outline" size="sm" onClick={() => setValue(original)} className="text-xs">
              変更を取消
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="bg-black text-white hover:bg-black/90 gap-1 text-xs"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            保存
          </Button>
        </div>
      </div>

      {/* プレースホルダー案内 */}
      {section.placeholders && (
        <div className="flex items-start gap-2 px-5 py-2.5 border-b border-border bg-blue-50/50">
          <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {section.placeholders.map(p => (
              <span key={p.token} className="text-xs text-blue-700">
                <code className="bg-white border border-blue-200 rounded px-1 font-mono">{p.token}</code>
                {' '}{p.desc}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* テキストエリア */}
      <div className="relative">
        <textarea
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full min-h-[200px] px-5 py-4 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/20 bg-card transition-shadow"
          placeholder="プロンプトを入力..."
          spellCheck={false}
        />
        <div className="absolute bottom-3 right-4 flex items-center gap-3 text-xs text-muted-foreground select-none pointer-events-none">
          {isDirty && (
            <span className="text-amber-600 font-medium flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />未保存
            </span>
          )}
          <span className="tabular-nums">{value.length.toLocaleString()} 文字</span>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ───────────────────────────────────────────────────────────────
export default function AdminPrompts() {
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<Record<string, PromptData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/admin/ai-prompts')
      .then(d => setPrompts(d))
      .catch(() => toast({ title: '読み込みに失敗しました', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = useCallback((key: string, value: string, isCustomized: boolean) => {
    setPrompts(prev => ({ ...prev, [key]: { value, isCustomized } }));
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="h-6 w-6" />AIプロンプト設定
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          アプリ内でAIが使用するプロンプトを編集できます。変更はリアルタイムで反映されます。
        </p>
      </div>

      {/* 概要パネル */}
      <div className="rounded-xl border border-border bg-muted/20 px-5 py-4">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
            <p className="font-medium text-foreground">プロンプトの管理について</p>
            <p>各AI機能のプロンプトを個別に編集・保存できます。「デフォルトに戻す」でいつでも初期状態に戻せます。</p>
            <p>カスタム保存したプロンプトはDBに保存され、アプリの再起動後も維持されます。</p>
          </div>
        </div>
      </div>

      {/* AIフロー・車両マッチング可視化 */}
      <AIFlowVisualizer />

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-5">
          {PROMPT_SECTIONS.map(section => (
            <PromptEditor
              key={section.key}
              section={section}
              data={prompts[section.key] ?? { value: '', isCustomized: false }}
              onSaved={handleSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
