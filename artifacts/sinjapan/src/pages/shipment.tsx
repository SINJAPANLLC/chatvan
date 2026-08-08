import React, { useState, useEffect } from 'react';
import { useRoute, Link } from 'wouter';
import { useGetShipment, getGetShipmentQueryKey, useListConversations } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Circle, Loader2, CreditCard, MessageSquare, X, Bot, User, Truck, Phone, MapPin, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STATUS_FLOW = [
  '受付完了',
  '手配中',
  '配車確定',
  '集荷完了',
  '配送中',
  '納品完了',
  '決済待ち',
];

const IMMEDIATE_CANCEL_STATUSES = ['受付中', 'ヒアリング中', '見積提示'];
const CAN_REQUEST_CANCEL_STATUSES = ['顧客承認', '受付完了', '手配中', '配車確定', '集荷完了', '配送中', '納品完了'];

export default function Shipment() {
  const [, params] = useRoute('/shipment/:id');
  const shipmentId = Number(params?.id);
  const [showChat, setShowChat] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [extraStops, setExtraStops] = useState<{type: string; address: string; datetime: string}[]>([]);

  useEffect(() => {
    if (!shipmentId) return;
    const token = localStorage.getItem('sinjapan_auth_token');
    fetch(`/api/shipments/${shipmentId}/stops`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.stops) setExtraStops(d.stops); })
      .catch(() => {});
  }, [shipmentId]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: shipment, isLoading } = useGetShipment(shipmentId, {
    query: {
      enabled: !!shipmentId,
      queryKey: getGetShipmentQueryKey(shipmentId),
      refetchInterval: 5000 // Poll for status updates
    }
  });

  if (isLoading || !shipment) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Handle case where it's not yet in the flow
  let currentIndex = STATUS_FLOW.indexOf(shipment.status);
  
  // Map internal states to the visible flow
  if (shipment.status === '顧客承認') currentIndex = 0;
  // 納品完了 → 決済待ちステップを現在地にする
  if (shipment.status === '納品完了') currentIndex = STATUS_FLOW.indexOf('決済待ち');
  if (currentIndex === -1 && shipment.status !== 'キャンセル' && shipment.status !== '請求完了') {
    currentIndex = 0;
  }
  // 請求完了はステッパー全完了扱い
  if (shipment.status === '請求完了') currentIndex = STATUS_FLOW.length;

  const isPaid = shipment.status === '請求完了';
  const needsPayment = shipment.status === '納品完了';
  const isCancelRequested = shipment.status === 'キャンセル申請中';
  const isCancelled = shipment.status === 'キャンセル';
  const canImmediateCancel = IMMEDIATE_CANCEL_STATUSES.includes(shipment.status);
  const canRequestCancel = CAN_REQUEST_CANCEL_STATUSES.includes(shipment.status);

  const handleCancelRequest = async () => {
    setCancelLoading(true);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const res = await fetch(`/api/shipments/${shipmentId}/cancel-request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
      toast({ title: canImmediateCancel ? 'キャンセルしました' : 'キャンセル申請を送りました' });
      setShowCancelConfirm(false);
    } catch {
      toast({ variant: 'destructive', title: '操作に失敗しました' });
    } finally { setCancelLoading(false); }
  };

  return (
    <>
    <div className="flex-1 p-4 md:p-8 flex justify-center items-start">
      <div className="w-full max-w-3xl space-y-8 animate-in fade-in duration-500">
        
        <div className="flex flex-col md:flex-row gap-8">
          {/* Status Stepper */}
          <div className="w-full md:w-1/3">
            <h2 className="text-xl font-bold mb-6">配送状況</h2>
            <div className="space-y-6">
              {STATUS_FLOW.map((status, index) => {
                const isPast = index < currentIndex;
                const isCurrent = index === currentIndex;
                
                return (
                  <div key={status} className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
                        isPast 
                          ? 'bg-primary border-primary text-primary-foreground' 
                          : isCurrent 
                            ? 'border-primary bg-background text-primary' 
                            : 'border-muted-foreground/30 text-muted-foreground/30'
                      }`}>
                        {isPast ? <Check className="h-4 w-4" /> : <Circle className="h-2 w-2 fill-current" />}
                      </div>
                      {index < STATUS_FLOW.length - 1 && (
                        <div className={`w-0.5 h-10 mt-2 ${
                          isPast ? 'bg-primary' : 'bg-border'
                        }`} />
                      )}
                    </div>
                    <div className="pt-1">
                      <p className={`font-medium ${
                        isPast || isCurrent ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {status}
                      </p>
                      {isCurrent && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {status === '受付完了' && '手配を開始します'}
                          {status === '手配中' && '車両を探しています'}
                          {status === '配車確定' && '車両が確定しました'}
                          {status === '集荷完了' && '荷物をお預かりしました'}
                          {status === '配送中' && 'お届け先へ配送中です'}
                          {status === '納品完了' && '配送が完了しました'}
                          {status === '決済待ち' && '決済をお願いします'}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

          {/* Details */}
          <div className="w-full md:w-2/3 space-y-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="bg-muted/30 border-b border-border/50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">案件詳細</CardTitle>
                    <p className="text-sm text-muted-foreground">ID: #{shipment.id.toString().padStart(6, '0')}</p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setShowChat(true)}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    会話履歴
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  
                  <div className="p-4 grid grid-cols-3 gap-4">
                    <div className="text-sm text-muted-foreground">集荷先①</div>
                    <div className="col-span-2 text-sm font-medium">
                      {shipment.pickupAddress}
                      <div className="text-xs text-muted-foreground font-normal mt-1">{shipment.pickupDatetime}</div>
                    </div>
                  </div>
                  {extraStops.filter((s: any) => s.type === 'pickup').map((s: any, i: number) => (
                    <div key={i} className="p-4 grid grid-cols-3 gap-4">
                      <div className="text-sm text-muted-foreground">集荷先{i + 2}</div>
                      <div className="col-span-2 text-sm font-medium">
                        {s.address}
                        <div className="text-xs text-muted-foreground font-normal mt-1">{s.datetime}</div>
                      </div>
                    </div>
                  ))}

                  <div className="p-4 grid grid-cols-3 gap-4">
                    <div className="text-sm text-muted-foreground">納品先①</div>
                    <div className="col-span-2 text-sm font-medium">
                      {shipment.deliveryAddress}
                      <div className="text-xs text-muted-foreground font-normal mt-1">{shipment.deliveryDeadline}</div>
                    </div>
                  </div>
                  {extraStops.filter((s: any) => s.type === 'delivery').map((s: any, i: number) => (
                    <div key={i} className="p-4 grid grid-cols-3 gap-4">
                      <div className="text-sm text-muted-foreground">納品先{i + 2}</div>
                      <div className="col-span-2 text-sm font-medium">
                        {s.address}
                        <div className="text-xs text-muted-foreground font-normal mt-1">{s.datetime}</div>
                      </div>
                    </div>
                  ))}

                  <div className="p-4 grid grid-cols-3 gap-4">
                    <div className="text-sm text-muted-foreground">荷物</div>
                    <div className="col-span-2 text-sm">
                      {[shipment.cargoType, shipment.cargoQuantity].filter(Boolean).join(' / ') || '—'}
                    </div>
                  </div>

                  <div className="p-4 grid grid-cols-3 gap-4">
                    <div className="text-sm text-muted-foreground">車両</div>
                    <div className="col-span-2 text-sm">
                      {(() => {
                        const s = shipment as any;
                        const label = [s.vehicleSize, s.vehicleBodyType].filter(Boolean).join(' ') || shipment.vehicleType || '—';
                        const count = s.truckCount && s.truckCount > 1 ? ` × ${s.truckCount}台` : '';
                        return label + count;
                      })()}
                    </div>
                  </div>

                  <div className="p-4 grid grid-cols-3 gap-4">
                    <div className="text-sm text-muted-foreground">配送区分</div>
                    <div className="col-span-2 text-sm">
                      {(shipment as any).deliveryType || shipment.deliveryMethod || '—'}
                    </div>
                  </div>

                  {(shipment as any).additionalWork && (shipment as any).additionalWork !== '不要' && (
                    <div className="p-4 grid grid-cols-3 gap-4">
                      <div className="text-sm text-muted-foreground">付帯作業</div>
                      <div className="col-span-2 text-sm">{(shipment as any).additionalWork}</div>
                    </div>
                  )}

                  {(shipment as any).highwayUse && (
                    <div className="p-4 grid grid-cols-3 gap-4">
                      <div className="text-sm text-muted-foreground">高速代</div>
                      <div className="col-span-2 text-sm">{(shipment as any).highwayUse}（実費別途）</div>
                    </div>
                  )}

                  {shipment.notes && (
                    <div className="p-4 grid grid-cols-3 gap-4">
                      <div className="text-sm text-muted-foreground">備考</div>
                      <div className="col-span-2 text-sm whitespace-pre-wrap text-muted-foreground">{shipment.notes}</div>
                    </div>
                  )}

                  <div className="p-4 grid grid-cols-3 gap-4">
                    <div className="text-sm text-muted-foreground">料金</div>
                    <div className="col-span-2 text-sm font-bold">
                      {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(Number(shipment.customerPrice) || 0)}
                      <span className="text-xs font-normal text-muted-foreground ml-1">(税別)</span>
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>

            {/* GPS位置カード */}
            {currentIndex >= STATUS_FLOW.indexOf('集荷完了') && (() => {
              const s = shipment as any;
              const lat = s.driverLat ? Number(s.driverLat) : null;
              const lng = s.driverLng ? Number(s.driverLng) : null;
              if (!lat || !lng) return null;
              const updatedAt = s.driverLocationUpdatedAt ? new Date(s.driverLocationUpdatedAt) : null;
              const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
              const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.015},${lat-0.010},${lng+0.015},${lat+0.010}&layer=mapnik&marker=${lat},${lng}`;
              return (
                <Card className="border-border shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 bg-muted/40 border-b border-border">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span className="font-semibold text-sm">ドライバー位置</span>
                    </div>
                    {updatedAt && (
                      <span className="text-xs opacity-60">{Math.round((Date.now() - updatedAt.getTime()) / 60000)}分前</span>
                    )}
                  </div>
                  <iframe
                    src={embedUrl}
                    className="w-full h-52 border-0"
                    title="ドライバー位置"
                  />
                  <CardContent className="p-3">
                    <a href={mapsUrl} target="_blank" rel="noreferrer"
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      <MapPin className="h-3.5 w-3.5" />Googleマップで開く
                    </a>
                  </CardContent>
                </Card>
              );
            })()}

            {/* ドライバー情報カード — 配車確定以降に表示 */}
            {currentIndex >= STATUS_FLOW.indexOf('配車確定') && (
              (() => {
                const s = shipment as any;
                const carrier = s.carrier;
                const driverName = shipment.assignedDriverName;
                if (!driverName && !carrier?.companyName) return null;
                return (
                  <Card className="border-border shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3.5 bg-muted/40 border-b border-border">
                      <Truck className="h-4 w-4" />
                      <span className="font-semibold text-sm">担当ドライバー</span>
                    </div>
                    <CardContent className="p-0">
                      <div className="divide-y divide-border/50">
                        {(s.driverCarrierName || carrier?.companyName) && (
                          <div className="p-4 grid grid-cols-3 gap-4">
                            <div className="text-sm text-muted-foreground">運送会社</div>
                            <div className="col-span-2 text-sm font-medium">{s.driverCarrierName || carrier?.companyName}</div>
                          </div>
                        )}
                        {driverName && (
                          <div className="p-4 grid grid-cols-3 gap-4">
                            <div className="text-sm text-muted-foreground">ドライバー名</div>
                            <div className="col-span-2 text-sm font-medium">{driverName}</div>
                          </div>
                        )}
                        {s.driverVehicleNumber && (
                          <div className="p-4 grid grid-cols-3 gap-4">
                            <div className="text-sm text-muted-foreground">車番</div>
                            <div className="col-span-2 text-sm font-medium">{s.driverVehicleNumber}</div>
                          </div>
                        )}
                        {s.driverPhone && (
                          <div className="p-4 grid grid-cols-3 gap-4">
                            <div className="text-sm text-muted-foreground">ドライバー連絡先</div>
                            <div className="col-span-2">
                              <a href={`tel:${s.driverPhone}`} className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
                                <Phone className="h-3.5 w-3.5 text-muted-foreground" />{s.driverPhone}
                              </a>
                            </div>
                          </div>
                        )}
                        {carrier?.phone && (
                          <div className="p-4 grid grid-cols-3 gap-4">
                            <div className="text-sm text-muted-foreground">連絡先</div>
                            <div className="col-span-2">
                              <a
                                href={`tel:${carrier.phone}`}
                                className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                              >
                                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                {carrier.phone}
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()
            )}

            {needsPayment && (
              <div className="rounded-xl bg-foreground text-background p-4 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <CreditCard className="h-4 w-4" />
                  決済をお願いします
                </div>
                <p className="text-xs opacity-70">配送が完了しました。下記から決済を完了してください。</p>
                <Link href={`/payment/${shipmentId}`}>
                  <Button className="w-full bg-background text-foreground hover:bg-background/90">
                    決済へ進む
                  </Button>
                </Link>
              </div>
            )}

            {isPaid && (
              <div className="rounded-xl bg-green-50 border border-green-200 p-4 flex items-center gap-2 text-green-700 text-sm font-semibold">
                <Check className="h-4 w-4" />
                支払い完了
              </div>
            )}

            {/* キャンセル申請中 */}
            {isCancelRequested && (
              <div className="rounded-xl bg-orange-50 border border-orange-200 p-4 flex items-center gap-2 text-orange-700 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>キャンセル申請中です。担当者が確認後、ご連絡します。</span>
              </div>
            )}

            {/* キャンセルボタン */}
            {(canImmediateCancel || canRequestCancel) && !showCancelConfirm && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full text-xs text-muted-foreground hover:text-red-500 transition-colors py-2 text-center underline-offset-2 hover:underline"
              >
                {canImmediateCancel ? 'この依頼をキャンセルする' : 'キャンセルを申請する'}
              </button>
            )}

            {/* キャンセル確認 */}
            {showCancelConfirm && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-red-700">
                  {canImmediateCancel ? 'この依頼をキャンセルしますか？' : 'キャンセルを申請しますか？'}
                </p>
                <p className="text-xs text-red-600">
                  {canImmediateCancel
                    ? '即時キャンセルされます。この操作は取り消せません。'
                    : '担当者が確認後、承認または却下をお知らせします。'}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowCancelConfirm(false)} className="flex-1 text-xs">
                    戻る
                  </Button>
                  <Button size="sm" disabled={cancelLoading} onClick={handleCancelRequest}
                    className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white">
                    {cancelLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : canImmediateCancel ? 'キャンセルする' : '申請する'}
                  </Button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>

    {/* 会話履歴パネル */}
    {showChat && <ChatPanel shipmentId={shipmentId} onClose={() => setShowChat(false)} />}
    </>
  );
}

interface ChatPanelProps { shipmentId: number; onClose: () => void }
function ChatPanel({ shipmentId, onClose }: ChatPanelProps) {
  const { data: messages, isLoading } = useListConversations(shipmentId);

  return (
    <>
      {/* オーバーレイ */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      {/* ドロワー */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-background border-l border-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 font-semibold">
            <MessageSquare className="h-4 w-4" />
            会話履歴
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* メッセージ一覧 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && (!messages || messages.length === 0) && (
            <p className="text-center text-sm text-muted-foreground py-10">会話履歴がありません</p>
          )}
          {messages?.map(msg => {
            const isUser = msg.sender === 'user';
            return (
              <div key={msg.id} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}>
                  {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  isUser
                    ? 'bg-foreground text-background rounded-tr-sm'
                    : 'bg-muted text-foreground rounded-tl-sm'
                }`}>
                  {msg.message}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
