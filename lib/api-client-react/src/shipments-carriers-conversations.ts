/**
 * Typed compatibility hooks for the shipments, carriers, and conversation
 * Express routes.  These are hand-written (not generated) and must never be
 * edited by Orval / codegen.
 *
 * Exports expected by page consumers:
 *   useListShipments, useGetShipment, useCreateShipment,
 *   useUpdateShipment, useUpdateShipmentStatus, getGetShipmentQueryKey,
 *   useListCarriers, useCreateCarrier, useUpdateCarrier,
 *   useListConversations, getListConversationsQueryKey, useSendMessage
 */

import {
  useQuery,
  useMutation,
} from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseQueryResult,
  UseMutationOptions,
  UseMutationResult,
  QueryKey,
} from '@tanstack/react-query';
import { customFetch } from './custom-fetch';

// ---------------------------------------------------------------------------
// Shared domain types
// ---------------------------------------------------------------------------

export interface ShipmentUser {
  id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  isCompany?: boolean | null;
  createdAt?: string | null;
}

export interface ShipmentCarrier {
  id: number;
  companyName?: string | null;
  phone?: string | null;
  averageCost?: number | null;
  onTimeRate?: number | null;
  rating?: number | null;
  createdAt?: string | null;
}

export interface Shipment {
  id: number;
  userId?: number | null;
  status: string;
  pickupAddress?: string | null;
  pickupDatetime?: string | null;
  deliveryAddress?: string | null;
  deliveryDeadline?: string | null;
  cargoType?: string | null;
  cargoQuantity?: string | null;
  cargoWeight?: string | null;
  cargoSize?: string | null;
  vehicleType?: string | null;
  deliveryMethod?: string | null;
  vehicleSize?: string | null;
  vehicleBodyType?: string | null;
  truckCount?: number | null;
  deliveryType?: string | null;
  additionalWork?: string | null;
  highwayUse?: string | boolean | null;
  notes?: string | null;
  customerPrice?: number | null;
  carrierCost?: number | null;
  grossProfit?: number | null;
  desiredPrice?: number | null;
  assignedCarrierId?: number | null;
  assignedDriverName?: string | null;
  squarePaymentId?: string | null;
  cancelPreviousStatus?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  user?: ShipmentUser | null;
  carrier?: ShipmentCarrier | null;
  [key: string]: unknown;
}

export interface ShipmentListResponse {
  items: Shipment[];
  total: number;
}

export interface Carrier {
  id: number;
  companyName: string;
  contactName?: string | null;
  phone?: string | null;
  fax?: string | null;
  serviceAreas?: string | null;
  vehicleTypes?: string | null;
  bankAccount?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  averageCost?: number | null;
  onTimeRate?: number | null;
  rating?: number | null;
  createdAt?: string | null;
  [key: string]: unknown;
}

export interface Conversation {
  id: number;
  shipmentId: number;
  sender: 'user' | 'ai';
  message: string;
  structuredData?: unknown;
  createdAt?: string | null;
}

export interface SendMessageResponse {
  message: string;
  shipmentId: number;
  isComplete: boolean;
  options: string[];
}

// ---------------------------------------------------------------------------
// Query key helpers
// ---------------------------------------------------------------------------

export function getListShipmentsQueryKey(params?: Record<string, unknown>): QueryKey {
  return ['/api/shipments', params] as const;
}

export function getGetShipmentQueryKey(id: number): QueryKey {
  return ['/api/shipments', id] as const;
}

export function getListCarriersQueryKey(): QueryKey {
  return ['/api/carriers'] as const;
}

export function getListConversationsQueryKey(shipmentId: number): QueryKey {
  return ['/api/shipments', shipmentId, 'conversations'] as const;
}

// ---------------------------------------------------------------------------
// Shipment query params
// ---------------------------------------------------------------------------

export interface ListShipmentsParams {
  userId?: number;
  status?: string;
  carrierId?: number;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// useListShipments
// ---------------------------------------------------------------------------

export function useListShipments(
  params: ListShipmentsParams = {},
  options?: {
    query?: Omit<UseQueryOptions<ShipmentListResponse, Error, ShipmentListResponse, QueryKey>, 'queryFn'>;
  },
): UseQueryResult<ShipmentListResponse, Error> {
  const { queryKey: _ignored, ...restQuery } = options?.query ?? {};
  return useQuery<ShipmentListResponse, Error, ShipmentListResponse, QueryKey>({
    queryKey: getListShipmentsQueryKey(params as Record<string, unknown>),
    queryFn: () => {
      const search = new URLSearchParams();
      if (params.userId != null) search.set('userId', String(params.userId));
      if (params.status != null) search.set('status', params.status);
      if (params.carrierId != null) search.set('carrierId', String(params.carrierId));
      if (params.dateFrom != null) search.set('dateFrom', params.dateFrom);
      if (params.dateTo != null) search.set('dateTo', params.dateTo);
      if (params.page != null) search.set('page', String(params.page));
      if (params.limit != null) search.set('limit', String(params.limit));
      const qs = search.toString();
      return customFetch<ShipmentListResponse>(`/api/shipments${qs ? `?${qs}` : ''}`);
    },
    ...restQuery,
  });
}

// ---------------------------------------------------------------------------
// useGetShipment
// ---------------------------------------------------------------------------

export function useGetShipment(
  id: number,
  options?: {
    query?: Omit<UseQueryOptions<Shipment, Error, Shipment, QueryKey>, 'queryFn'>;
  },
): UseQueryResult<Shipment, Error> {
  const { queryKey: _ignored, ...restQuery } = options?.query ?? {};
  return useQuery<Shipment, Error, Shipment, QueryKey>({
    queryKey: getGetShipmentQueryKey(id),
    queryFn: () => customFetch<Shipment>(`/api/shipments/${id}`),
    enabled: !!id,
    ...restQuery,
  });
}

// ---------------------------------------------------------------------------
// useCreateShipment
// ---------------------------------------------------------------------------

export function useCreateShipment(
  options?: UseMutationOptions<Shipment, Error, Partial<Shipment>>,
): UseMutationResult<Shipment, Error, Partial<Shipment>> {
  return useMutation<Shipment, Error, Partial<Shipment>>({
    mutationFn: (data) =>
      customFetch<Shipment>('/api/shipments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// useUpdateShipment
// ---------------------------------------------------------------------------

export interface UpdateShipmentVariables {
  id: number;
  data: Partial<Shipment>;
}

export function useUpdateShipment(
  options?: UseMutationOptions<Shipment, Error, UpdateShipmentVariables>,
): UseMutationResult<Shipment, Error, UpdateShipmentVariables> {
  return useMutation<Shipment, Error, UpdateShipmentVariables>({
    mutationFn: ({ id, data }) =>
      customFetch<Shipment>(`/api/shipments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// useUpdateShipmentStatus
// ---------------------------------------------------------------------------

export interface UpdateShipmentStatusVariables {
  id: number;
  data: { status: string };
}

export function useUpdateShipmentStatus(
  options?: UseMutationOptions<Shipment, Error, UpdateShipmentStatusVariables>,
): UseMutationResult<Shipment, Error, UpdateShipmentStatusVariables> {
  return useMutation<Shipment, Error, UpdateShipmentStatusVariables>({
    mutationFn: ({ id, data }) =>
      customFetch<Shipment>(`/api/shipments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// useListCarriers
// ---------------------------------------------------------------------------

export function useListCarriers(
  options?: {
    query?: Omit<UseQueryOptions<Carrier[], Error, Carrier[], QueryKey>, 'queryFn'>;
  },
): UseQueryResult<Carrier[], Error> {
  const { queryKey: _ignored, ...restQuery } = options?.query ?? {};
  return useQuery<Carrier[], Error, Carrier[], QueryKey>({
    queryKey: getListCarriersQueryKey(),
    queryFn: () => customFetch<Carrier[]>('/api/carriers'),
    ...restQuery,
  });
}

// ---------------------------------------------------------------------------
// useCreateCarrier
// ---------------------------------------------------------------------------

export interface CreateCarrierVariables {
  data: Partial<Carrier>;
}

export function useCreateCarrier(
  options?: UseMutationOptions<Carrier, Error, CreateCarrierVariables>,
): UseMutationResult<Carrier, Error, CreateCarrierVariables> {
  return useMutation<Carrier, Error, CreateCarrierVariables>({
    mutationFn: ({ data }) =>
      customFetch<Carrier>('/api/carriers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// useUpdateCarrier
// ---------------------------------------------------------------------------

export interface UpdateCarrierVariables {
  id: number;
  data: Partial<Carrier>;
}

export function useUpdateCarrier(
  options?: UseMutationOptions<Carrier, Error, UpdateCarrierVariables>,
): UseMutationResult<Carrier, Error, UpdateCarrierVariables> {
  return useMutation<Carrier, Error, UpdateCarrierVariables>({
    mutationFn: ({ id, data }) =>
      customFetch<Carrier>(`/api/carriers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// useListConversations
// ---------------------------------------------------------------------------

export function useListConversations(
  shipmentId: number,
  options?: {
    query?: Omit<UseQueryOptions<Conversation[], Error, Conversation[], QueryKey>, 'queryFn'>;
  },
): UseQueryResult<Conversation[], Error> {
  const { queryKey: _ignored, ...restQuery } = options?.query ?? {};
  return useQuery<Conversation[], Error, Conversation[], QueryKey>({
    queryKey: getListConversationsQueryKey(shipmentId),
    queryFn: () => customFetch<Conversation[]>(`/api/shipments/${shipmentId}/conversations`),
    enabled: !!shipmentId,
    ...restQuery,
  });
}

// ---------------------------------------------------------------------------
// useSendMessage
// ---------------------------------------------------------------------------

export interface SendMessageVariables {
  id: number;
  data: { message: string };
}

export function useSendMessage(
  options?: UseMutationOptions<SendMessageResponse, Error, SendMessageVariables>,
): UseMutationResult<SendMessageResponse, Error, SendMessageVariables> {
  return useMutation<SendMessageResponse, Error, SendMessageVariables>({
    mutationFn: ({ id, data }) =>
      customFetch<SendMessageResponse>(`/api/shipments/${id}/conversations`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    ...options,
  });
}
