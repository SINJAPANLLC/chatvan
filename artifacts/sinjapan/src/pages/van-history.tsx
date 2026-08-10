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
  active: '利用中', completed: '完了', rejected: '見送り',
};

const STATUS_STYLES: Record<string, string> = {
  new:                  'bg-blue-50 text-blue-700 border-blue-200',
  hearing:              'bg-blue-50 text-blue-700 border-blue-200',
  proposed:             'bg-purple-50 text-purple-700 border-purple-200',
  application_received: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  screening:            'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved:             'bg-green-50 text-green-700 border-green-200',
  contracting:          'bg-indigo-50 text-indigo-700 border-indigo-200',
  pending_payment:      'bg-orange-50 text-orange-700 border-orange-200',
  active:               'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed:            'bg-gray-50 text-gray-600 border-gray-200',
  rejected:             'bg-red-50 text-red-700 border-red-200',
};

const DOT: Record<string, string> = {
  new: 'bg-blue-400', hearing: 'bg-blue-400', proposed: 'bg-purple-400',
  application_received: 'bg-yellow-400', screening: 'bg-yellow-400', approved: 'bg-green-400',
  contracting: 'bg-indigo-400', pending_payment: 'bg-orange-400',
  active: 'bg-emerald-500', completed: 'bg-gray-300', rejected: 'bg-red-400',
};

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
                    <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${DOT[app.status] ?? 'bg-gray-400'}`} />
                    <div>
                      <p className="font-semibold text-sm leading-tight">
                        {app.area ?? `相談 #${app.id}`}
                      </p>
                      {app.purpose && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{app.purpose}</p>
                      )}
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
