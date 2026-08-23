import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import {
  useGetShipment, useUpdateShipment, useUpdateShipmentStatus,
  useListCarriers, getGetShipmentQueryKey,
  useListConversations, getListConversationsQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, ArrowLeft, Save, Pencil, Bot, User, FileText, Send, X, MapPin, Navigation, Bell, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

const fmt = (n: number | string | null | undefined) =>
  n ? new Intl.NumberFormat('ja-JP').format(Number(n)) : '—';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-3 border-b border-border/40 last:border-0 gap-4">
      <span className="text-sm text-muted-foreground shrink-0 w-32">{label}</span>
      <span className="text-sm font-medium text-right">{value || '—'}</span>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}
function Section({ title, children, action }: SectionProps) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="font-semibold text-sm">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

export default function AdminShipmentDetail() {
  const [, params] = useRoute('/admin/shipments/:id');
  const shipmentId = Number(params?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showCaptureConfirm, setShowCaptureConfirm] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const { data: shipment, isLoading } = useGetShipment(shipmentId, {
    query: { enabled: !!shipmentId, queryKey: getGetShipmentQueryKey(shipmentId) }
  });
  const { data: carriers } = useListCarriers();
  const { data: conversations } = useListConversations(shipmentId, {
    query: { enabled: !!shipmentId, queryKey: getListConversationsQueryKey(shipmentId) }
  });

  const updateShipment = useUpdateShipment();
  const updateStatus = useUpdateShipmentStatus();

  type Stop = { type: 'pickup' | 'delivery'; address: string; datetime: string };

  const [editMode, setEditMode] = useState(false);
  const [editInfoMode, setEditInfoMode] = useState(false);
  const [editRevenueMode, setEditRevenueMode] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [extraStops, setExtraStops] = useState<Stop[]>([]);
  const [editExtraStops, setEditExtraStops] = useState<Stop[]>([]);
  const [showInstruction, setShowInstruction] = useState(false);
  const [driverToken, setDriverToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifyPrice, setNotifyPrice] = useState('');
  const [notifyMsg, setNotifyMsg] = useState('');
  const [sendingNotify, setSendingNotify] = useState(false);
  const [showMasterCard, setShowMasterCard] = useState(false);
  const [masterCardToken, setMasterCardToken] = useState<string | null>(null);
  const [generatingMasterToken, setGeneratingMasterToken] = useState(false);
  const [masterCardData, setMasterCardData] = useState<Record<string, string> | null>(null);

  // マスターカード提出データ取得
  React.useEffect(() => {
    if (!shipmentId) return;
    const token = localStorage.getItem('sinjapan_auth_token');
    fetch(`/api/shipments/${shipmentId}/master-card-data`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.masterCardData) setMasterCardData(d.masterCardData); })
      .catch(() => {});
  }, [shipmentId]);

  // 複数地点取得
  React.useEffect(() => {
    if (!shipmentId) return;
    const token = localStorage.getItem('sinjapan_auth_token');
    fetch(`/api/shipments/${shipmentId}/stops`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.stops) setExtraStops(d.stops); })
      .catch(() => {});
  }, [shipmentId]);

  React.useEffect(() => {
    if (shipment) {
      setFormData({
        // 収益
        customerPrice: shipment.customerPrice || '',
        // 手配内容
        driverCarrierName: (shipment as any).driverCarrierName || '',
        assignedDriverName: shipment.assignedDriverName || '',
        driverPhone: (shipment as any).driverPhone || '',
        driverVehicleNumber: (shipment as any).driverVehicleNumber || '',
        carrierCost: shipment.carrierCost || '',
        notes: shipment.notes || '',
        // 配送情報
        pickupAddress: shipment.pickupAddress || '',
        pickupDatetime: shipment.pickupDatetime || '',
        deliveryAddress: shipment.deliveryAddress || '',
        deliveryDeadline: shipment.deliveryDeadline || '',
        cargoType: shipment.cargoType || '',
        cargoQuantity: shipment.cargoQuantity || '',
        cargoWeight: shipment.cargoWeight || '',
        cargoSize: shipment.cargoSize || '',
        vehicleType: shipment.vehicleType || '',
        deliveryMethod: shipment.deliveryMethod || '',
      });
    }
  }, [shipment]);

  if (isLoading || !shipment) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateStatus.mutateAsync({ id: shipmentId, data: { status: newStatus } });
      queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
      toast({ title: 'ステータスを更新しました' });
    } catch {
      toast({ variant: 'destructive', title: '更新に失敗しました' });
    }
  };

  const saveStops = async (stops: Stop[]) => {
    const token = localStorage.getItem('sinjapan_auth_token');
    await fetch(`/api/shipments/${shipmentId}/stops`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ stops }),
    });
    setExtraStops(stops);
  };

  const handleSave = async () => {
    try {
      const payload: any = {
        // 収益
        customerPrice: formData.customerPrice ? Number(formData.customerPrice) : undefined,
        // 手配内容
        driverCarrierName: formData.driverCarrierName || undefined,
        assignedDriverName: formData.assignedDriverName || undefined,
        driverPhone: formData.driverPhone || undefined,
        driverVehicleNumber: formData.driverVehicleNumber || undefined,
        carrierCost: formData.carrierCost ? Number(formData.carrierCost) : undefined,
        notes: formData.notes,
        // 配送情報
        pickupAddress: formData.pickupAddress || undefined,
        pickupDatetime: formData.pickupDatetime || undefined,
        deliveryAddress: formData.deliveryAddress || undefined,
        deliveryDeadline: formData.deliveryDeadline || undefined,
        cargoType: formData.cargoType || undefined,
        cargoQuantity: formData.cargoQuantity || undefined,
        cargoWeight: formData.cargoWeight || undefined,
        cargoSize: formData.cargoSize || undefined,
        vehicleType: formData.vehicleType || undefined,
        deliveryMethod: formData.deliveryMethod || undefined,
      };
      await updateShipment.mutateAsync({ id: shipmentId, data: payload });
      if (editInfoMode) await saveStops(editExtraStops);
      queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
      setEditMode(false);
      setEditInfoMode(false);
      toast({ title: '保存しました' });
    } catch {
      toast({ variant: 'destructive', title: '保存に失敗しました' });
    }
  };

  const openInstruction = async () => {
    setShowInstruction(true);
    if (driverToken) return;
    setGeneratingToken(true);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const res = await fetch(`/api/driver/generate/${shipmentId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setDriverToken(data.token);
    } finally { setGeneratingToken(false); }
  };

  const openMasterCard = async () => {
    setShowMasterCard(true);
    if (masterCardToken) return;
    // マスターカードも指示書と同じトークンを使用（既にあれば再利用）
    if (driverToken) { setMasterCardToken(driverToken); return; }
    setGeneratingMasterToken(true);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const res = await fetch(`/api/driver/generate/${shipmentId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setDriverToken(data.token);
      setMasterCardToken(data.token);
    } finally { setGeneratingMasterToken(false); }
  };

  const driverPortalUrl = driverToken
    ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/driver/${driverToken}`
    : null;

  const masterCardUrl = masterCardToken
    ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/master-card/${masterCardToken}`
    : null;

  const statuses = [
    '受付中', 'ヒアリング中', '見積提示', '顧客承認',
    '手配中', '配車確定', '集荷完了', '配送中', '納品完了', '請求完了', 'キャンセル', 'キャンセル申請中'
  ];

  const grossProfit = Number(shipment.customerPrice || 0) - Number(shipment.carrierCost || 0);
  const profitRate = shipment.customerPrice
    ? Math.round((grossProfit / Number(shipment.customerPrice)) * 1000) / 10
    : 0;

  return (
    <div className="space-y-6 pb-20 max-w-5xl">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Link href="/admin/shipments">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">案件 #{shipment.id}</h1>
        <div className="ml-auto flex items-center gap-3">
          <Select value={shipment.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-40 font-medium bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* キャンセル申請中バナー */}
      {shipment.status === 'キャンセル申請中' && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="font-semibold text-orange-800 text-sm">キャンセル申請が届いています</p>
            <p className="text-xs text-orange-700 mt-0.5">顧客からキャンセルの申請があります。承認または却下してください。</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-100 text-xs"
              onClick={async () => {
                try {
                  const token = localStorage.getItem('sinjapan_auth_token');
                  await fetch(`/api/shipments/${shipment.id}/cancel-reject`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
                  queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
                  toast({ title: 'キャンセル申請を却下しました' });
                } catch { toast({ variant: 'destructive', title: '操作に失敗しました' }); }
              }}>
              却下
            </Button>
            <Button size="sm"
              className="bg-red-600 hover:bg-red-700 text-white text-xs"
              onClick={async () => {
                try {
                  const token = localStorage.getItem('sinjapan_auth_token');
                  await fetch(`/api/shipments/${shipment.id}/cancel-approve`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
                  queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
                  toast({ title: 'キャンセルを承認しました' });
                } catch { toast({ variant: 'destructive', title: '操作に失敗しました' }); }
              }}>
              キャンセル承認
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左カラム */}
        <div className="lg:col-span-3 space-y-5">

          {/* 顧客情報 */}
          {shipment.user && (
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold text-sm">顧客情報</h2>
                {(shipment.user as any).isCompany && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">法人</span>
                )}
              </div>
              <div className="px-5 py-4">
                <Row label="氏名" value={(shipment.user as any).name} />
                {(shipment.user as any).companyName && (
                  <Row label="会社名" value={(shipment.user as any).companyName} />
                )}
                <Row label="メール" value={
                  <a href={`mailto:${(shipment.user as any).email}`} className="underline underline-offset-2 hover:opacity-70">
                    {(shipment.user as any).email}
                  </a>
                } />
                {(shipment.user as any).phone && (
                  <Row label="電話番号" value={
                    <a href={`tel:${(shipment.user as any).phone}`} className="underline underline-offset-2 hover:opacity-70">
                      {(shipment.user as any).phone}
                    </a>
                  } />
                )}
              </div>
            </div>
          )}

          {/* 配送情報 */}
          <Section
            title="配送情報"
            action={
              editInfoMode ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditInfoMode(false)}>キャンセル</Button>
                  <Button size="sm" onClick={handleSave} disabled={updateShipment.isPending}>
                    <Save className="h-3.5 w-3.5 mr-1.5" />保存
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => { setEditInfoMode(true); setEditExtraStops([...extraStops]); }}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />編集
                </Button>
              )
            }
          >
            {editInfoMode ? (
              <div className="space-y-4 py-2">
                {/* 集荷先（メイン） */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">集荷先①</Label>
                  </div>
                  <Input value={formData.pickupAddress} onChange={e => setFormData({...formData, pickupAddress: e.target.value})} placeholder="東京都〇〇区…" />
                  <Input value={formData.pickupDatetime} onChange={e => setFormData({...formData, pickupDatetime: e.target.value})} placeholder="集荷日時（例: 2024-11-01 10:00）" />
                </div>
                {/* 追加集荷先 */}
                {editExtraStops.filter(s => s.type === 'pickup').map((s, i) => {
                  const idx = editExtraStops.indexOf(s);
                  return (
                    <div key={i} className="space-y-2 border-l-2 border-blue-200 pl-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-blue-600">集荷先{i + 2}</Label>
                        <button onClick={() => setEditExtraStops(editExtraStops.filter((_, j) => j !== idx))} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Input value={s.address} onChange={e => setEditExtraStops(editExtraStops.map((es, j) => j === idx ? {...es, address: e.target.value} : es))} placeholder="追加集荷先住所" />
                      <Input value={s.datetime} onChange={e => setEditExtraStops(editExtraStops.map((es, j) => j === idx ? {...es, datetime: e.target.value} : es))} placeholder="集荷日時" />
                    </div>
                  );
                })}
                <button onClick={() => setEditExtraStops([...editExtraStops, {type: 'pickup', address: '', datetime: ''}])}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
                  <Plus className="h-3.5 w-3.5" />集荷先を追加
                </button>

                {/* 納品先（メイン） */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-xs font-semibold">納品先①</Label>
                  <Input value={formData.deliveryAddress} onChange={e => setFormData({...formData, deliveryAddress: e.target.value})} placeholder="大阪府〇〇市…" />
                  <Input value={formData.deliveryDeadline} onChange={e => setFormData({...formData, deliveryDeadline: e.target.value})} placeholder="納品期限（例: 2024-11-02 17:00）" />
                </div>
                {/* 追加納品先 */}
                {editExtraStops.filter(s => s.type === 'delivery').map((s, i) => {
                  const idx = editExtraStops.indexOf(s);
                  return (
                    <div key={i} className="space-y-2 border-l-2 border-green-200 pl-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-green-600">納品先{i + 2}</Label>
                        <button onClick={() => setEditExtraStops(editExtraStops.filter((_, j) => j !== idx))} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Input value={s.address} onChange={e => setEditExtraStops(editExtraStops.map((es, j) => j === idx ? {...es, address: e.target.value} : es))} placeholder="追加納品先住所" />
                      <Input value={s.datetime} onChange={e => setEditExtraStops(editExtraStops.map((es, j) => j === idx ? {...es, datetime: e.target.value} : es))} placeholder="納品日時" />
                    </div>
                  );
                })}
                <button onClick={() => setEditExtraStops([...editExtraStops, {type: 'delivery', address: '', datetime: ''}])}
                  className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-800 font-medium">
                  <Plus className="h-3.5 w-3.5" />納品先を追加
                </button>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                  <div className="space-y-1.5">
                    <Label className="text-xs">荷物の種類</Label>
                    <Input value={formData.cargoType} onChange={e => setFormData({...formData, cargoType: e.target.value})} placeholder="パレット" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">数量</Label>
                    <Input value={formData.cargoQuantity} onChange={e => setFormData({...formData, cargoQuantity: e.target.value})} placeholder="20枚" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">重量</Label>
                    <Input value={formData.cargoWeight} onChange={e => setFormData({...formData, cargoWeight: e.target.value})} placeholder="500kg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">サイズ</Label>
                    <Input value={formData.cargoSize} onChange={e => setFormData({...formData, cargoSize: e.target.value})} placeholder="100×100×100cm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">車両</Label>
                    <Input value={formData.vehicleType} onChange={e => setFormData({...formData, vehicleType: e.target.value})} placeholder="4tウイング" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">配送方法</Label>
                    <Input value={formData.deliveryMethod} onChange={e => setFormData({...formData, deliveryMethod: e.target.value})} placeholder="スポットチャーター" />
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* 集荷先（メイン） */}
                <Row label="集荷先①" value={
                  <span>{shipment.pickupAddress}<br />
                    <span className="text-xs text-muted-foreground font-normal">{shipment.pickupDatetime}</span>
                  </span>
                } />
                {extraStops.filter(s => s.type === 'pickup').map((s, i) => (
                  <Row key={i} label={`集荷先${i + 2}`} value={
                    <span>{s.address}<br />
                      <span className="text-xs text-muted-foreground font-normal">{s.datetime}</span>
                    </span>
                  } />
                ))}
                {/* 納品先（メイン） */}
                <Row label="納品先①" value={
                  <span>{shipment.deliveryAddress}<br />
                    <span className="text-xs text-muted-foreground font-normal">{shipment.deliveryDeadline}</span>
                  </span>
                } />
                {extraStops.filter(s => s.type === 'delivery').map((s, i) => (
                  <Row key={i} label={`納品先${i + 2}`} value={
                    <span>{s.address}<br />
                      <span className="text-xs text-muted-foreground font-normal">{s.datetime}</span>
                    </span>
                  } />
                ))}
                <Row label="荷物" value={[shipment.cargoType, shipment.cargoQuantity].filter(Boolean).join(' / ')} />
                <Row label="重量・サイズ" value={[shipment.cargoWeight, shipment.cargoSize].filter(Boolean).join(' / ')} />
                <Row label="車両・配送方法" value={[shipment.vehicleType, shipment.deliveryMethod].filter(Boolean).join(' / ')} />
              </>
            )}
          </Section>

          {/* 手配内容 */}
          <Section
            title="手配内容"
            action={
              editMode ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>キャンセル</Button>
                  <Button size="sm" onClick={handleSave} disabled={updateShipment.isPending}>
                    <Save className="h-3.5 w-3.5 mr-1.5" />保存
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />編集
                </Button>
              )
            }
          >
            {editMode ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">運送会社</Label>
                    <Input
                      value={formData.driverCarrierName}
                      onChange={(e) => setFormData({ ...formData, driverCarrierName: e.target.value })}
                      placeholder="〇〇運輸"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ドライバー名</Label>
                    <Input
                      value={formData.assignedDriverName}
                      onChange={(e) => setFormData({ ...formData, assignedDriverName: e.target.value })}
                      placeholder="山田 太郎"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ドライバー連絡先</Label>
                    <Input
                      value={formData.driverPhone}
                      onChange={(e) => setFormData({ ...formData, driverPhone: e.target.value })}
                      placeholder="090-0000-0000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">車番</Label>
                    <Input
                      value={formData.driverVehicleNumber}
                      onChange={(e) => setFormData({ ...formData, driverVehicleNumber: e.target.value })}
                      placeholder="品川 100 あ 1234"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">原価（円）</Label>
                    <Input
                      type="number"
                      value={formData.carrierCost}
                      onChange={(e) => setFormData({ ...formData, carrierCost: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">備考</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="min-h-[80px]"
                  />
                </div>
              </div>
            ) : (
              <div>
                <Row label="運送会社" value={(shipment as any).driverCarrierName || shipment.carrier?.companyName} />
                <Row label="ドライバー名" value={shipment.assignedDriverName} />
                {(shipment as any).driverPhone && (
                  <Row label="ドライバー連絡先" value={
                    <a href={`tel:${(shipment as any).driverPhone}`} className="hover:underline text-foreground">
                      {(shipment as any).driverPhone}
                    </a>
                  } />
                )}
                {(shipment as any).driverVehicleNumber && (
                  <Row label="車番" value={(shipment as any).driverVehicleNumber} />
                )}
                <Row label="原価" value={shipment.carrierCost ? `¥ ${fmt(shipment.carrierCost)}` : undefined} />
                {driverPortalUrl && (
                  <div className="px-4 py-3 flex items-start gap-3 border-b border-border/40 last:border-0">
                    <span className="text-sm text-muted-foreground w-24 shrink-0">ドライバーURL</span>
                    <a href={driverPortalUrl} target="_blank" rel="noreferrer"
                      className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 break-all">
                      {driverPortalUrl}
                    </a>
                  </div>
                )}
                <div className="pt-3">
                  <p className="text-xs text-muted-foreground mb-1.5">備考</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground bg-muted/30 rounded-lg p-3 min-h-[48px]">
                    {shipment.notes || 'メモなし'}
                  </p>
                </div>
              </div>
            )}
          </Section>

          {/* 指示書送付ボタン */}
          <button
            onClick={openInstruction}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-foreground text-background py-4 text-sm font-medium hover:opacity-80 transition-opacity"
          >
            <FileText className="h-4 w-4" />
            指示書を送付する
          </button>

          {/* マスターカード送付ボタン */}
          <button
            onClick={openMasterCard}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-4 text-sm font-medium hover:bg-muted transition-colors"
          >
            <FileText className="h-4 w-4" />
            マスターカードを送付する
          </button>

          {/* 送信済みマスターカード表示 */}
          {(() => {
            const mc = masterCardData;
            if (!mc) return null;
            const LABELS: [string, string][] = [
              ['companyName', '会社名'],
              ['companyKana', '会社名（フリガナ）'],
              ['branchName', '支店名'],
              ['address', '所在地'],
              ['tel', 'TEL'],
              ['fax', 'FAX'],
              ['dispatchContact', '配車担当'],
              ['accountingContact', '経理担当'],
              ['representative', '代表者'],
              ['closingDate', '締め日'],
              ['paymentSite', '支払日サイト'],
              ['bankName', '振込先銀行'],
              ['accountType', '預金種別'],
              ['accountHolder', '口座名義'],
              ['qualifiedInvoice', '適格請求書'],
              ['registrationNumber', '事業者登録番号'],
              ['receiptAddress', '受領書送付先'],
              ['insuranceCompany', '加入保険会社'],
              ['vehicles', '保有車両'],
            ];
            const submittedAt = mc.submittedAt ? new Date(mc.submittedAt).toLocaleString('ja-JP') : null;
            return (
              <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-3.5 w-3.5" />
                    送信済みマスターカード
                  </div>
                  <div className="flex items-center gap-2">
                    {submittedAt && <span className="text-xs text-muted-foreground">{submittedAt}</span>}
                    {(shipment as any).driverToken && (
                      <a
                        href={`${window.location.origin}/master-card/${(shipment as any).driverToken}?print=1`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs px-2 py-1 rounded-md bg-foreground text-background hover:opacity-80 transition-opacity"
                      >
                        PDFで見る
                      </a>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-border/40">
                  {LABELS.filter(([k]) => mc[k]).map(([k, label]) => (
                    <div key={k} className="flex justify-between items-start px-4 py-2.5 gap-3">
                      <span className="text-xs text-muted-foreground shrink-0 w-28">{label}</span>
                      <span className="text-xs font-medium text-right break-all">{mc[k]}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        </div>

        {/* 右カラム */}
        <div className="lg:col-span-2 space-y-5">

          {/* お客様希望金額 */}
          {(shipment as any).desiredPrice && (
            <>
              <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">お客様ご希望金額</span>
                  <div className="text-right">
                    <span className="font-semibold text-sm">¥ {fmt((shipment as any).desiredPrice)}</span>
                    {shipment.customerPrice && (
                      <p className={`text-xs mt-0.5 ${Number((shipment as any).desiredPrice) >= Number(shipment.customerPrice) ? 'text-green-600' : 'text-amber-600'}`}>
                        {Number((shipment as any).desiredPrice) >= Number(shipment.customerPrice)
                          ? `見積もり内（差額 ¥${fmt(Number((shipment as any).desiredPrice) - Number(shipment.customerPrice))}）`
                          : `見積もりより ¥${fmt(Number(shipment.customerPrice) - Number((shipment as any).desiredPrice))} 高い`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {/* 値引き承認通知ボタン */}
              <button
                onClick={() => {
                  setNotifyPrice(shipment.customerPrice ? String(Math.round(Number(shipment.customerPrice))) : '');
                  setNotifyMsg('');
                  setShowNotifyModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-4 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Bell className="h-4 w-4" />
                値引き承認を顧客に通知
              </button>
            </>
          )}

          {/* 収益サマリー */}
          <div className="bg-primary text-primary-foreground rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-primary-foreground/10 flex items-center justify-between">
              <h2 className="font-semibold text-sm">収益</h2>
              {editRevenueMode ? (
                <div className="flex gap-2">
                  <button onClick={() => setEditRevenueMode(false)} className="text-xs text-primary-foreground/60 hover:text-primary-foreground px-2 py-1 rounded">キャンセル</button>
                  <button onClick={async () => { await handleSave(); setEditRevenueMode(false); }} disabled={updateShipment.isPending} className="text-xs bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground px-3 py-1 rounded flex items-center gap-1">
                    <Save className="h-3 w-3" />保存
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditRevenueMode(true)} className="text-xs text-primary-foreground/60 hover:text-primary-foreground flex items-center gap-1">
                  <Pencil className="h-3 w-3" />編集
                </button>
              )}
            </div>
            {editRevenueMode ? (
              <div className="px-5 py-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-primary-foreground/70">売上（円）</label>
                  <input
                    type="number"
                    value={formData.customerPrice}
                    onChange={e => setFormData({...formData, customerPrice: e.target.value})}
                    className="w-full bg-primary-foreground/10 border border-primary-foreground/20 rounded-lg px-3 py-2 text-sm text-primary-foreground placeholder:text-primary-foreground/40 outline-none focus:border-primary-foreground/40"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-primary-foreground/70">原価（円）</label>
                  <input
                    type="number"
                    value={formData.carrierCost}
                    onChange={e => setFormData({...formData, carrierCost: e.target.value})}
                    className="w-full bg-primary-foreground/10 border border-primary-foreground/20 rounded-lg px-3 py-2 text-sm text-primary-foreground placeholder:text-primary-foreground/40 outline-none focus:border-primary-foreground/40"
                    placeholder="0"
                  />
                </div>
                {formData.customerPrice && formData.carrierCost && (
                  <div className="border-t border-primary-foreground/10 pt-3 flex justify-between">
                    <span className="text-sm font-bold">粗利（試算）</span>
                    <div className="text-right">
                      <div className="font-bold">¥ {fmt(Number(formData.customerPrice) - Number(formData.carrierCost))}</div>
                      <div className="text-xs text-primary-foreground/60">
                        {Math.round(((Number(formData.customerPrice) - Number(formData.carrierCost)) / Number(formData.customerPrice)) * 1000) / 10}%
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-primary-foreground/10">
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-primary-foreground/70">売上</span>
                  <span className="font-semibold">¥ {fmt(shipment.customerPrice)}</span>
                </div>
                <div className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-primary-foreground/70">原価</span>
                  <span className="font-semibold">¥ {fmt(shipment.carrierCost)}</span>
                </div>
                <div className="flex justify-between items-center px-5 py-4">
                  <span className="text-sm font-bold">粗利</span>
                  <div className="text-right">
                    <div className="text-xl font-bold">¥ {fmt(grossProfit)}</div>
                    <div className="text-xs text-primary-foreground/60">{profitRate}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 決済ステータス */}
          {(() => {
            const s = shipment as any;
            const paymentId = s.squarePaymentId;
            const captured = s.squareCaptured;
            if (!paymentId && shipment.status !== '納品完了') return null;
            return (
              <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="font-semibold text-sm">決済</h2>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {paymentId ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">ステータス</span>
                        <span className={`font-semibold ${captured === 'true' ? 'text-green-600' : 'text-amber-600'}`}>
                          {captured === 'true' ? '決済完了' : 'オーソリ済み（未キャプチャ）'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Square Payment ID</span>
                        <span className="font-mono text-xs text-muted-foreground truncate max-w-[140px]">{paymentId}</span>
                      </div>
                      {captured !== 'true' && shipment.status === '納品完了' && (
                        <Button
                          className="w-full mt-2"
                          onClick={() => setShowCaptureConfirm(true)}
                        >
                          キャプチャ（決済確定）
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">カード未登録またはオーソリ未実行</p>
                      <Button variant="outline" size="sm" className="w-full text-xs"
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem('sinjapan_auth_token');
                            const res = await fetch(`/api/square/authorize-on-file/${shipmentId}`, {
                              method: 'POST',
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            if (!res.ok) {
                              const d = await res.json();
                              throw new Error(d.error ?? '失敗');
                            }
                            queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
                            toast({ title: 'オーソリを実行しました' });
                          } catch (e: any) {
                            toast({ variant: 'destructive', title: `オーソリ失敗: ${e.message}` });
                          }
                        }}>
                        手動でオーソリを実行
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* AIヒアリング履歴 */}
          <div className="bg-card border border-border rounded-xl shadow-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">AIヒアリング履歴</h2>
            </div>
            <div className="px-4 py-4 max-h-[480px] overflow-y-auto space-y-3">
              {!conversations || conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">履歴はありません</p>
              ) : (
                conversations.map((msg) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div key={msg.id} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}>
                        {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                      </div>
                      <div className={`text-xs rounded-2xl px-3 py-2.5 leading-relaxed whitespace-pre-wrap max-w-[82%] ${
                        isUser ? 'bg-foreground text-background rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm'
                      }`}>
                        {msg.message}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* GPS位置 */}
          {(() => {
            const s = shipment as any;
            const lat = s.driverLat ? Number(s.driverLat) : null;
            const lng = s.driverLng ? Number(s.driverLng) : null;
            if (!lat || !lng) return null;
            const updatedAt = s.driverLocationUpdatedAt ? new Date(s.driverLocationUpdatedAt) : null;
            const minsAgo = updatedAt ? Math.round((Date.now() - updatedAt.getTime()) / 60000) : null;
            const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.015},${lat-0.010},${lng+0.015},${lat+0.010}&layer=mapnik&marker=${lat},${lng}`;
            const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            return (
              <div className="rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-green-500" />
                    <span className="font-semibold text-sm">ドライバー位置</span>
                  </div>
                  {minsAgo !== null && (
                    <span className="text-xs text-muted-foreground">{minsAgo === 0 ? 'たった今' : `${minsAgo}分前`}</span>
                  )}
                </div>
                <iframe src={embedUrl} className="w-full h-52 border-0" title="ドライバー位置" />
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
                  <a href={mapsUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <MapPin className="h-3 w-3" />Googleマップ
                  </a>
                </div>
              </div>
            );
          })()}

        </div>
      </div>

      {/* 値引き承認通知モーダル */}
      {showNotifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowNotifyModal(false)} />
          <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md z-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2 font-semibold">
                <Bell className="h-4 w-4" />値引き承認通知
              </div>
              <button onClick={() => setShowNotifyModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                お客様に値引き後の金額を通知します。金額を更新する場合は下記に入力してください。
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">承認金額（円・税別）</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
                  <input
                    type="number"
                    value={notifyPrice}
                    onChange={e => setNotifyPrice(e.target.value)}
                    placeholder={shipment.customerPrice ? String(Math.round(Number(shipment.customerPrice))) : '0'}
                    className="w-full border border-border rounded-lg pl-7 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                </div>
                <p className="text-xs text-muted-foreground">現在の見積もり: ¥{fmt(shipment.customerPrice)}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">メッセージ（任意）</label>
                <textarea
                  value={notifyMsg}
                  onChange={e => setNotifyMsg(e.target.value)}
                  rows={3}
                  placeholder="空欄の場合は自動生成されます"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-y focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setShowNotifyModal(false)}>キャンセル</Button>
              <Button
                disabled={sendingNotify}
                onClick={async () => {
                  setSendingNotify(true);
                  try {
                    const token = localStorage.getItem('sinjapan_auth_token');
                    const res = await fetch(`/api/admin/shipments/${shipmentId}/notify-price-approval`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({
                        customPrice: notifyPrice ? Number(notifyPrice) : undefined,
                        message: notifyMsg || undefined,
                      }),
                    });
                    if (!res.ok) throw new Error('送信失敗');
                    if (notifyPrice) {
                      queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
                    }
                    toast({ title: '通知を送信しました' });
                    setShowNotifyModal(false);
                  } catch {
                    toast({ variant: 'destructive', title: '送信に失敗しました' });
                  } finally {
                    setSendingNotify(false);
                  }
                }}
              >
                {sendingNotify ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />送信中…</> : <><Send className="h-4 w-4 mr-1.5" />通知を送る</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 指示書送付モーダル */}
      {showInstruction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowInstruction(false)} />
          <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-lg z-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2 font-semibold">
                <FileText className="h-4 w-4" />
                指示書送付
              </div>
              <button onClick={() => setShowInstruction(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-muted-foreground">以下の内容で運送会社へ指示書を送付します。</p>

              {/* ドライバーポータルリンク */}
              <div className="bg-foreground text-background rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold opacity-70">ドライバーポータルURL</p>
                {generatingToken ? (
                  <div className="flex items-center gap-2 text-sm opacity-70">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />生成中...
                  </div>
                ) : driverPortalUrl ? (
                  <>
                    <p className="text-xs break-all font-mono opacity-80">{driverPortalUrl}</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { navigator.clipboard.writeText(driverPortalUrl); toast({ title: 'URLをコピーしました' }); }}
                        className="flex-1 py-1.5 text-xs rounded-lg bg-background/20 hover:bg-background/30 transition-colors font-medium"
                      >
                        URLをコピー
                      </button>
                      <a
                        href={driverPortalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-1.5 text-xs rounded-lg bg-background/20 hover:bg-background/30 transition-colors font-medium text-center"
                      >
                        プレビュー
                      </a>
                    </div>
                  </>
                ) : (
                  <p className="text-xs opacity-60">URL生成に失敗しました</p>
                )}
              </div>

              <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3 text-sm">
                <div className="font-bold text-base border-b border-border pb-2">配送指示書 — 案件 #{shipment.id}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <span className="text-muted-foreground">運送会社</span>
                  <span className="font-medium">{shipment.carrier?.companyName || '未定'}</span>
                  <span className="text-muted-foreground">ドライバー</span>
                  <span className="font-medium">{shipment.assignedDriverName || '未定'}</span>
                  <span className="text-muted-foreground">集荷先①</span>
                  <span className="font-medium">{shipment.pickupAddress || '—'}</span>
                  <span className="text-muted-foreground">集荷日時</span>
                  <span className="font-medium">{shipment.pickupDatetime || '—'}</span>
                  {extraStops.filter(s => s.type === 'pickup').map((s, i) => (
                    <React.Fragment key={i}>
                      <span className="text-muted-foreground">集荷先{i + 2}</span>
                      <span className="font-medium">{s.address || '—'}{s.datetime ? `（${s.datetime}）` : ''}</span>
                    </React.Fragment>
                  ))}
                  <span className="text-muted-foreground">納品先①</span>
                  <span className="font-medium">{shipment.deliveryAddress || '—'}</span>
                  <span className="text-muted-foreground">納品期限</span>
                  <span className="font-medium">{shipment.deliveryDeadline || '—'}</span>
                  {extraStops.filter(s => s.type === 'delivery').map((s, i) => (
                    <React.Fragment key={i}>
                      <span className="text-muted-foreground">納品先{i + 2}</span>
                      <span className="font-medium">{s.address || '—'}{s.datetime ? `（${s.datetime}）` : ''}</span>
                    </React.Fragment>
                  ))}
                  <span className="text-muted-foreground">荷物</span>
                  <span className="font-medium">{[shipment.cargoType, shipment.cargoQuantity].filter(Boolean).join(' / ') || '—'}</span>
                  <span className="text-muted-foreground">車両</span>
                  <span className="font-medium">{shipment.vehicleType || '—'}</span>
                  <span className="text-muted-foreground">金額</span>
                  <span className="font-medium">{shipment.carrierCost ? `¥ ${fmt(shipment.carrierCost)}` : '—'}</span>
                </div>
                {shipment.notes && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-muted-foreground text-xs">備考：</span>
                    <p className="mt-1 whitespace-pre-wrap">{shipment.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setShowInstruction(false)}>閉じる</Button>
            </div>
          </div>
        </div>
      )}

      {/* マスターカード送付モーダル */}
      {showMasterCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowMasterCard(false)} />
          <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-lg z-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2 font-semibold">
                <FileText className="h-4 w-4" />
                マスターカード送付
              </div>
              <button onClick={() => setShowMasterCard(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-muted-foreground">以下のURLを運送会社へ共有してください。運送会社が自社情報を入力・送信するとinfo@chat-van.comに通知されます。</p>
              <div className="bg-foreground text-background rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold opacity-70">マスターカードURL</p>
                {generatingMasterToken ? (
                  <div className="flex items-center gap-2 text-sm opacity-70">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />生成中...
                  </div>
                ) : masterCardUrl ? (
                  <>
                    <p className="text-xs break-all font-mono opacity-80">{masterCardUrl}</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { navigator.clipboard.writeText(masterCardUrl); toast({ title: 'URLをコピーしました' }); }}
                        className="flex-1 py-1.5 text-xs rounded-lg bg-background/20 hover:bg-background/30 transition-colors font-medium"
                      >
                        URLをコピー
                      </button>
                      <a
                        href={masterCardUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-1.5 text-xs rounded-lg bg-background/20 hover:bg-background/30 transition-colors font-medium text-center"
                      >
                        プレビュー
                      </a>
                    </div>
                  </>
                ) : (
                  <p className="text-xs opacity-60">URL生成に失敗しました</p>
                )}
              </div>
              <div className="bg-muted/30 border border-border rounded-xl p-4 text-sm space-y-1.5">
                <p className="font-semibold text-xs text-muted-foreground mb-2">運送会社の操作手順</p>
                <p>① URLにアクセスして自社情報を記入</p>
                <p>② 「送信する」ボタンで提出</p>
                <p>③ 印刷・PDF保存も可能</p>
              </div>
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-border">
              <button
                onClick={() => setShowMasterCard(false)}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* キャプチャ確認ダイアログ */}
      <Dialog open={showCaptureConfirm} onOpenChange={setShowCaptureConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              キャプチャ（決済確定）の確認
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-left">
              <p>登録済みカードに対して実金額を請求します。</p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 space-y-1">
                <p className="font-semibold">⚠️ 実行前に確認してください</p>
                <p>・お客様がすでに決済画面から支払い済みの場合、<strong>二重請求</strong>になります</p>
                <p>・管理画面の「決済」欄でお客様の支払い状況を確認してから実行してください</p>
              </div>
              {shipment && (
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">案件</span>
                    <span className="font-medium">#{String(shipmentId).padStart(6, '0')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">請求金額（税込）</span>
                    <span className="font-bold">¥{fmt(Math.round(Number((shipment as any).customerPrice || 0) * 1.1))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">現在のステータス</span>
                    <span className="font-medium">{shipment.status}</span>
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCaptureConfirm(false)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              disabled={capturing}
              onClick={async () => {
                setCapturing(true);
                try {
                  const token = localStorage.getItem('sinjapan_auth_token');
                  const paymentId = (shipment as any)?.squarePaymentId;
                  const res = await fetch(`/api/square/capture/${paymentId}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  if (!res.ok) throw new Error();
                  queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
                  toast({ title: 'キャプチャ完了・請求完了に更新しました' });
                  setShowCaptureConfirm(false);
                } catch {
                  toast({ variant: 'destructive', title: 'キャプチャに失敗しました' });
                } finally {
                  setCapturing(false);
                }
              }}
            >
              {capturing ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />処理中…</> : '確認して請求する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
