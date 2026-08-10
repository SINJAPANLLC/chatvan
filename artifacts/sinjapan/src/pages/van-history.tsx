import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Plus, History, ChevronRight, Loader2 } from 'lucide-react';

const apiUrl = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });

type VanApp = {
  id: number;
  status: string;
  area: string | null;
  purpose: string | null;
  monthlyBudget: string | null;
  createdAt: string;
  updatedAt: string;
};

function appLink(app: VanApp): string {
  const { id, status } = app;
  if (['new', 'hearing'].includes(status)) return `/van/${id}`;
  if (status === 'proposed') return `/van/${id}/proposal`;
  return `/van/${id}/status`;
}

const STATUS_LABEL: Record<string, string> = {
  new: '相談中', hearing: 'ヒアリング中', proposed: '提案あり',
  application_received: '審査中', screening: '審査中', approved: '承認済み',
  contracting: '契約手続き', pending_payment: '決済待ち',
  active: '利用中', delivery_pending: '納車待ち', completed: '完了', rejected: '見送り',
  payment_pending: '決済待ち', payment_issue: '支払い問題', return_pending: '解約申請中', cancelled: 'キャンセル',
};

const STATUS_STYLES: Record<string, string> = {
  new:                  'bg-white text-foreground border-border',
  hearing:              'bg-white text-foreground border-border',
  proposed:             'bg-white text-foreground border-border',
  application_received: 'bg-white text-foreground border-border',
  screening:            'bg-white text-foreground border-border',
  approved:             'bg-foreground text-background border-foreground',
  contracting:          'bg-foreground text-background border-foreground',
  pending_payment:      'bg-white text-foreground border-border',
  active:               'bg-foreground text-background border-foreground',
  delivery_pending:     'bg-white text-foreground border-border',
  completed:            'bg-white text-muted-foreground border-border',
  rejected:             'bg-white text-muted-foreground border-border',
  payment_pending:      'bg-white text-foreground border-border',
  payment_issue:        'bg-white text-foreground border-border',
  return_pending:       'bg-white text-muted-foreground border-border',
  cancelled:            'bg-white text-muted-foreground border-border',
};

const DOT_STYLE = 'bg-foreground';

const STEP: Record<string, number> = {
  new: 0, hearing: 0, proposed: 1,
  application_received: 2, screening: 2, approved: 2,
  contracting: 3, pending_payment: 4, active: 5, completed: 5, rejected: -1,
};
const STEP_LABELS = ['新規相談', '車両提案', '審査', '契約', '支払い', '利用中'];

function fmt(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export default function VanHistory() {
  const [, setLocation] = useLocation();
  const [apps, setApps] = useState<VanApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl('/van/my/applications'), { credentials: 'include', headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(setApps)
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">相談履歴</h1>
          <p className="text-sm text-muted-foreground">{apps.length > 0 ? `${apps.length}件の相談` : '相談履歴はありません'}</p>
        </div>
        <button
          onClick={() => setLocation('/')}
          className="flex items-center gap-2 px-4 py-2.5 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />新規相談
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <History className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium mb-1">相談履歴がありません</p>
          <p className="text-sm text-muted-foreground mb-6">AIチャットで軽バンの相談を始めましょう</p>
          <button
            onClick={() => setLocation('/')}
            className="px-6 py-2.5 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity"
          >
            相談を始める
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map(app => {
            const step = STEP[app.status] ?? 0;
            const activeCount = step < 0 ? 0 : step + 1;
            return (
              <button
                key={app.id}
                onClick={() => setLocation(appLink(app))}
                className="w-full text-left rounded-2xl border border-border hover:border-foreground/30 hover:shadow-sm transition-all p-5 bg-card group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${DOT_STYLE}`} />
                    <div>
                      <p className="font-semibold text-sm leading-tight">
                        {`相談 #${app.id}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_STYLES[app.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {STATUS_LABEL[app.status] ?? app.status}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>

                {/* ステップバー（見送り以外） */}
                {step >= 0 && (
                  <div className="mb-3">
                    <div className="flex gap-1">
                      {STEP_LABELS.map((_, i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${i < activeCount ? 'bg-foreground' : 'bg-border'}`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">{STEP_LABELS[0]}</span>
                      <span className="text-[10px] text-muted-foreground">{STEP_LABELS[STEP_LABELS.length - 1]}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>申込番号 #{String(app.id).padStart(6, '0')}</span>
                  <span>{fmt(app.updatedAt ?? app.createdAt)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
