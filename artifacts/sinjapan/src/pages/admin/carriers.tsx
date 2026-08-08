import React, { useState, useMemo } from 'react';
import { useListCarriers, useCreateCarrier, useUpdateCarrier } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Pencil, Search, X, Phone, Building2, Truck, MapPin, CreditCard, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 50;

const FIELDS = [
  { label: '会社名 *', key: 'companyName', placeholder: '株式会社物流' },
  { label: '担当者名', key: 'contactName', placeholder: '佐藤 太郎' },
  { label: '電話番号', key: 'phone', placeholder: '03-0000-0000' },
  { label: 'FAX番号', key: 'fax', placeholder: '03-0000-0001' },
  { label: '対応エリア', key: 'serviceAreas', placeholder: '関東全域' },
  { label: '保有車両', key: 'vehicleTypes', placeholder: '2t, 4tウィング, 10t' },
  { label: '振込先', key: 'bankAccount', placeholder: '○○銀行 △△支店 普通 1234567' },
  { label: '支払いサイト', key: 'paymentTerms', placeholder: '月末締め翌月末払い' },
] as const;

const EMPTY = {
  companyName: '', contactName: '', phone: '', fax: '',
  serviceAreas: '', vehicleTypes: '', bankAccount: '', paymentTerms: '', notes: ''
};

type FormData = typeof EMPTY;

function splitTags(str?: string | null): string[] {
  if (!str) return [];
  return str.split(/[,、・\s]+/).map(s => s.trim()).filter(Boolean);
}

function CarrierForm({ data, onChange, onSubmit, onCancel, isPending, submitLabel }: {
  data: FormData; onChange: (k: string, v: string) => void;
  onSubmit: () => void; onCancel: () => void;
  isPending: boolean; submitLabel: string;
}) {
  return (
    <>
      <div className="grid gap-4 py-4">
        {FIELDS.map(({ label, key, placeholder }) => (
          <div key={key} className="space-y-1.5">
            <Label className="text-sm">{label}</Label>
            <Input value={(data as any)[key]} onChange={e => onChange(key, e.target.value)} placeholder={placeholder} />
          </div>
        ))}
        <div className="space-y-1.5">
          <Label className="text-sm">社内メモ</Label>
          <Textarea value={data.notes} onChange={e => onChange('notes', e.target.value)} placeholder="社内メモ" className="min-h-[72px]" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>キャンセル</Button>
        <Button onClick={onSubmit} disabled={isPending || !data.companyName}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{submitLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
      {label}
    </span>
  );
}

function CarrierRow({ c, onEdit }: { c: any; onEdit: (c: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const areaTags = splitTags(c.serviceAreas);
  const vehicleTags = splitTags(c.vehicleTypes);

  return (
    <>
      <tr
        className="hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        {/* 会社名 */}
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-snug">{c.companyName}</div>
              {c.contactName && <div className="text-xs text-muted-foreground">{c.contactName}</div>}
            </div>
          </div>
        </td>
        {/* 電話 */}
        <td className="px-4 py-3.5">
          {c.phone ? (
            <a
              href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
            >
              <Phone className="h-3.5 w-3.5 shrink-0" />{c.phone}
            </a>
          ) : <span className="text-muted-foreground text-sm">—</span>}
        </td>
        {/* エリア */}
        <td className="px-4 py-3.5">
          <div className="flex flex-wrap gap-1 max-w-[220px]">
            {areaTags.length ? areaTags.slice(0, 4).map(t => <Tag key={t} label={t} />) : <span className="text-sm text-muted-foreground">—</span>}
            {areaTags.length > 4 && <span className="text-xs text-muted-foreground">+{areaTags.length - 4}</span>}
          </div>
        </td>
        {/* 車両 */}
        <td className="px-4 py-3.5">
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {vehicleTags.length ? vehicleTags.slice(0, 3).map(t => <Tag key={t} label={t} />) : <span className="text-sm text-muted-foreground">—</span>}
            {vehicleTags.length > 3 && <span className="text-xs text-muted-foreground">+{vehicleTags.length - 3}</span>}
          </div>
        </td>
        {/* 支払い */}
        <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap hidden xl:table-cell">
          {c.paymentTerms || '—'}
        </td>
        {/* アクション */}
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-1">
            <button
              onClick={e => { e.stopPropagation(); onEdit(c); }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="編集"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10 border-t border-dashed border-border">
          <td colSpan={6} className="px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {c.fax && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-0.5">FAX</div>
                  <div>{c.fax}</div>
                </div>
              )}
              {c.bankAccount && (
                <div className="col-span-2">
                  <div className="text-xs font-medium text-muted-foreground mb-0.5 flex items-center gap-1"><CreditCard className="h-3 w-3" />振込先</div>
                  <div className="font-mono text-xs bg-muted/60 rounded px-2 py-1">{c.bankAccount}</div>
                </div>
              )}
              {c.paymentTerms && (
                <div className="xl:hidden">
                  <div className="text-xs font-medium text-muted-foreground mb-0.5">支払いサイト</div>
                  <div>{c.paymentTerms}</div>
                </div>
              )}
              {areaTags.length > 4 && (
                <div className="col-span-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" />全対応エリア</div>
                  <div className="flex flex-wrap gap-1">{areaTags.map(t => <Tag key={t} label={t} />)}</div>
                </div>
              )}
              {vehicleTags.length > 3 && (
                <div className="col-span-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Truck className="h-3 w-3" />全保有車両</div>
                  <div className="flex flex-wrap gap-1">{vehicleTags.map(t => <Tag key={t} label={t} />)}</div>
                </div>
              )}
              {c.notes && (
                <div className="col-span-4">
                  <div className="text-xs font-medium text-muted-foreground mb-0.5">社内メモ</div>
                  <div className="text-muted-foreground whitespace-pre-wrap">{c.notes}</div>
                </div>
              )}
              {!c.fax && !c.bankAccount && !c.notes && areaTags.length <= 4 && vehicleTags.length <= 3 && (
                <div className="col-span-4 text-muted-foreground text-xs">追加情報なし</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminCarriers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: carriers, isLoading } = useListCarriers();
  const createCarrier = useCreateCarrier();
  const updateCarrier = useUpdateCarrier();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editCarrier, setEditCarrier] = useState<any | null>(null);
  const [addForm, setAddForm] = useState<FormData>({ ...EMPTY });
  const [editForm, setEditForm] = useState<FormData>({ ...EMPTY });
  const [searchName, setSearchName] = useState('');
  const [searchArea, setSearchArea] = useState('');
  const [searchVehicle, setSearchVehicle] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!carriers) return [];
    return carriers.filter((c: any) => {
      const nameOk = !searchName || c.companyName?.includes(searchName);
      const areaOk = !searchArea || c.serviceAreas?.includes(searchArea);
      const vehOk  = !searchVehicle || c.vehicleTypes?.includes(searchVehicle);
      return nameOk && areaOk && vehOk;
    });
  }, [carriers, searchName, searchArea, searchVehicle]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // 検索変更時はページをリセット
  const setSearch = (setter: React.Dispatch<React.SetStateAction<string>>) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['/api/carriers'] });
  const setAdd = (k: string, v: string) => setAddForm(p => ({ ...p, [k]: v }));
  const setEdit = (k: string, v: string) => setEditForm(p => ({ ...p, [k]: v }));

  const handleCreate = async () => {
    try {
      await createCarrier.mutateAsync({ data: addForm as any });
      setIsAddOpen(false); setAddForm({ ...EMPTY }); invalidate();
      toast({ title: '登録しました' });
    } catch { toast({ title: '登録に失敗しました', variant: 'destructive' }); }
  };

  const openEdit = (c: any) => {
    setEditCarrier(c);
    setEditForm({
      companyName: c.companyName ?? '', contactName: c.contactName ?? '',
      phone: c.phone ?? '', fax: c.fax ?? '', serviceAreas: c.serviceAreas ?? '',
      vehicleTypes: c.vehicleTypes ?? '', bankAccount: c.bankAccount ?? '',
      paymentTerms: c.paymentTerms ?? '', notes: c.notes ?? '',
    });
  };

  const handleUpdate = async () => {
    if (!editCarrier) return;
    try {
      await updateCarrier.mutateAsync({ id: editCarrier.id, data: editForm as any });
      setEditCarrier(null); invalidate();
      toast({ title: '更新しました' });
    } catch { toast({ title: '更新に失敗しました', variant: 'destructive' }); }
  };

  const hasFilter = searchName || searchArea || searchVehicle;

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">運送会社管理</h1>
          {carriers && (
            <p className="text-sm text-muted-foreground mt-0.5">
              全 <span className="font-semibold text-foreground">{carriers.length.toLocaleString()}</span> 社
              {hasFilter && <> → <span className="font-semibold text-foreground">{filtered.length.toLocaleString()}</span> 社ヒット</>}
            </p>
          )}
        </div>
        <Button className="gap-2" onClick={() => { setAddForm({ ...EMPTY }); setIsAddOpen(true); }}>
          <Plus className="h-4 w-4" />新規登録
        </Button>
      </div>

      {/* 検索バー */}
      <div className="flex flex-wrap gap-3">
        <SearchInput value={searchName} onChange={setSearch(setSearchName)} placeholder="会社名で検索" icon={<Building2 className="h-4 w-4" />} />
        <SearchInput value={searchArea} onChange={setSearch(setSearchArea)} placeholder="エリア（例：関東、大阪）" icon={<MapPin className="h-4 w-4" />} />
        <SearchInput value={searchVehicle} onChange={setSearch(setSearchVehicle)} placeholder="車両（例：4t、ウィング）" icon={<Truck className="h-4 w-4" />} />
      </div>

      {/* テーブル */}
      <div className="rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">会社名 / 担当者</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">電話番号</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">対応エリア</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">保有車両</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden xl:table-cell">支払いサイト</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                  </td>
                </tr>
              ) : !paged.length ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center text-muted-foreground">
                    {hasFilter ? '条件に一致する運送会社がありません' : '運送会社が登録されていません'}
                  </td>
                </tr>
              ) : paged.map((c: any) => (
                <CarrierRow key={c.id} c={c} onEdit={openEdit} />
              ))}
            </tbody>
          </table>
        </div>

        {/* ページネーション */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <p className="text-sm text-muted-foreground">
              {((safePage - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(safePage * PAGE_SIZE, filtered.length).toLocaleString()} 件 / {filtered.length.toLocaleString()} 件
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {/* ページ番号 */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
                const p = start + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[32px] h-8 rounded-md text-sm font-medium transition-colors ${
                      p === safePage ? 'bg-foreground text-background' : 'hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 新規登録ダイアログ */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>運送会社の登録</DialogTitle></DialogHeader>
          <CarrierForm data={addForm} onChange={setAdd} onSubmit={handleCreate} onCancel={() => setIsAddOpen(false)} isPending={createCarrier.isPending} submitLabel="登録する" />
        </DialogContent>
      </Dialog>

      {/* 編集ダイアログ */}
      <Dialog open={!!editCarrier} onOpenChange={open => { if (!open) setEditCarrier(null); }}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editCarrier?.companyName} を編集</DialogTitle></DialogHeader>
          <CarrierForm data={editForm} onChange={setEdit} onSubmit={handleUpdate} onCancel={() => setEditCarrier(null)} isPending={updateCarrier.isPending} submitLabel="保存する" />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder, icon }: {
  value: string; onChange: (v: string) => void; placeholder: string; icon: React.ReactNode;
}) {
  return (
    <div className="relative flex-1 min-w-[180px]">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">{icon}</span>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
