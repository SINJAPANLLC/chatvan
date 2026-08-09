import React, { useState } from 'react';
import { AlertTriangle, Wrench, Phone, Clock, ChevronDown, ChevronUp } from 'lucide-react';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

function useIncidents() {
  const [accidents, setAccidents] = React.useState<any[]>([]);
  const [breakdowns, setBreakdowns] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, bRes] = await Promise.all([
        fetch(API('/van/incidents'), { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(API('/van/breakdowns'), { headers: { Authorization: `Bearer ${token()}` } }),
      ]);
      if (aRes.ok) setAccidents(await aRes.json());
      if (bRes.ok) setBreakdowns(await bRes.json());
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return { accidents, breakdowns, loading, reload: load };
}

const STATUS_COLORS: Record<string, string> = {
  reported: 'bg-red-50 text-red-700 border-red-200',
  in_progress: 'bg-orange-50 text-orange-700 border-orange-200',
  resolved: 'bg-green-50 text-green-700 border-green-200',
  closed: 'bg-gray-50 text-gray-500 border-gray-200',
};
const STATUS_LABELS: Record<string, string> = {
  reported: '報告受付', in_progress: '対応中', resolved: '解決済み', closed: 'クローズ',
};

function IncidentRow({ item, type }: { item: any; type: 'accident' | 'breakdown' }) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_COLORS[item.status] ?? STATUS_COLORS.reported;
  return (
    <>
      <tr className="border-b border-border hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${type === 'accident' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
            {type === 'accident' ? <AlertTriangle className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
            {type === 'accident' ? '事故' : '故障'}
          </span>
        </td>
        <td className="px-4 py-3 text-sm">
          <div className="font-medium">{item.user_name ?? '-'}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" />{item.user_phone ?? '-'}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
          {type === 'accident' ? item.description : item.symptom}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(item.created_at).toLocaleString('ja-JP')}</div>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${s}`}>
            {STATUS_LABELS[item.status] ?? item.status}
          </span>
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={6} className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {type === 'accident' ? (
                <>
                  <div><span className="text-xs text-muted-foreground block">発生場所</span>{item.location ?? '-'}</div>
                  <div><span className="text-xs text-muted-foreground block">けが人</span>{item.has_injuries ? '有' : 'なし'}</div>
                  <div><span className="text-xs text-muted-foreground block">警察通報</span>{item.police_contacted ? '済み' : '未通報'}</div>
                  <div><span className="text-xs text-muted-foreground block">自走</span>{item.can_drive ? '可能' : '不可'}</div>
                  {item.counterpart_info && <div className="col-span-2"><span className="text-xs text-muted-foreground block">相手方情報</span>{item.counterpart_info}</div>}
                </>
              ) : (
                <>
                  <div><span className="text-xs text-muted-foreground block">症状</span>{item.symptom ?? '-'}</div>
                  <div><span className="text-xs text-muted-foreground block">警告灯</span>{item.warning_lights ?? '-'}</div>
                  <div><span className="text-xs text-muted-foreground block">発生場所</span>{item.location ?? '-'}</div>
                  <div><span className="text-xs text-muted-foreground block">自走</span>{item.can_drive ? '可能' : '不可'}</div>
                  {item.ai_summary && <div className="col-span-2"><span className="text-xs text-muted-foreground block">AIサマリー</span>{item.ai_summary}</div>}
                </>
              )}
              {item.admin_notes && <div className="col-span-2"><span className="text-xs text-muted-foreground block">管理メモ</span>{item.admin_notes}</div>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminIncidents() {
  const { accidents, breakdowns, loading } = useIncidents();
  const [tab, setTab] = useState<'all' | 'accident' | 'breakdown'>('all');

  const allItems = [
    ...accidents.map(a => ({ ...a, _type: 'accident' as const })),
    ...breakdowns.map(b => ({ ...b, _type: 'breakdown' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filtered = tab === 'all' ? allItems : allItems.filter(i => i._type === tab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">事故・故障管理</h1>
        <p className="text-sm text-muted-foreground">ユーザーからの事故・故障報告を確認します</p>
      </div>

      <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 w-fit">
        {(['all', 'accident', 'breakdown'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'all' ? `全件 (${allItems.length})` : t === 'accident' ? `事故 (${accidents.length})` : `故障 (${breakdowns.length})`}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">報告はありません</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">種別</th>
                <th className="px-4 py-3 text-left font-medium">ユーザー</th>
                <th className="px-4 py-3 text-left font-medium">内容</th>
                <th className="px-4 py-3 text-left font-medium">報告日時</th>
                <th className="px-4 py-3 text-left font-medium">状態</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => <IncidentRow key={`${item._type}-${item.id}`} item={item} type={item._type} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
